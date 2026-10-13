"""
A BankID Relying Party API, version 6, in shape only: auth starts an order,
collect reports it pending until the configured number of collects, then
complete with the personal number the order required (or a default), cancel
forgets it. Standard library only, for the compose file and the tests; the
real API is mutual TLS with a certificate issued to the relying party, and
the authenticator against it is the same code.

    python3 -I Simulator.py            # listens on 8090
    BANKID_COLLECTS_UNTIL_COMPLETE=2   # pending answers before complete
"""
import json
import os
import secrets
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("BANKID_PORT", "8090"))
COLLECTS_UNTIL_COMPLETE = int(os.environ.get("BANKID_COLLECTS_UNTIL_COMPLETE", "2"))
DEFAULT_PERSONAL_NUMBER = os.environ.get("BANKID_DEFAULT_PERSONAL_NUMBER", "199001011234")
HINTS = ["outstandingTransaction", "userSign"]

orders = {}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.answer(400, {"errorCode": "invalidParameters", "details": "not JSON"})
        if self.path == "/rp/v6.0/auth":
            order_ref = secrets.token_hex(16)
            requirement = body.get("requirement") or {}
            orders[order_ref] = {
                "collects": 0,
                "personalNumber": requirement.get("personalNumber") or DEFAULT_PERSONAL_NUMBER,
                "endUserIp": body.get("endUserIp", ""),
            }
            return self.answer(200, {
                "orderRef": order_ref,
                "autoStartToken": secrets.token_hex(16),
                "qrStartToken": secrets.token_hex(16),
                "qrStartSecret": secrets.token_hex(16),
            })
        if self.path == "/rp/v6.0/collect":
            order = orders.get(body.get("orderRef", ""))
            if order is None:
                return self.answer(400, {"errorCode": "invalidParameters", "details": "No such order"})
            order["collects"] += 1
            if order["collects"] < COLLECTS_UNTIL_COMPLETE:
                hint = HINTS[min(order["collects"] - 1, len(HINTS) - 1)]
                return self.answer(200, {"orderRef": body["orderRef"], "status": "pending", "hintCode": hint})
            number = order["personalNumber"]
            return self.answer(200, {
                "orderRef": body["orderRef"],
                "status": "complete",
                "completionData": {
                    "user": {"personalNumber": number, "name": "Sven Simulated", "givenName": "Sven", "surname": "Simulated"},
                    "device": {"ipAddress": order["endUserIp"]},
                    "bankIdIssueDate": "2024-01-01",
                    "signature": "", "ocspResponse": "",
                },
            })
        if self.path == "/rp/v6.0/cancel":
            orders.pop(body.get("orderRef", ""), None)
            return self.answer(200, {})
        return self.answer(404, {"errorCode": "notFound"})

    def answer(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stdout.write("bankid %s %s\n" % (self.command, fmt % args))
        sys.stdout.flush()


if __name__ == "__main__":
    print("bankid simulator listening on %d, complete after %d collect(s)" % (PORT, COLLECTS_UNTIL_COMPLETE), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
