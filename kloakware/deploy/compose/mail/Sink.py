# The mail sink on a laptop (K14): an SMTP server that keeps every message it
# is handed and an HTTP endpoint that lists them, so the realm's mails, the
# reset and the verification, are read by the test and by a person without
# a mail server. Standard library only; the python image runs it with -I.
import json
import socketserver
import threading
from email import message_from_bytes
from email.header import decode_header, make_header
from http.server import BaseHTTPRequestHandler, HTTPServer

messages = []
lock = threading.Lock()


class Smtp(socketserver.StreamRequestHandler):
    def reply(self, line):
        self.wfile.write((line + "\r\n").encode())

    def handle(self):
        self.reply("220 mail.sink ESMTP")
        sender, recipients, data = None, [], None
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode(errors="replace").rstrip("\r\n")
            verb = line.split(" ", 1)[0].upper()
            if verb in ("HELO", "EHLO"):
                self.reply("250-mail.sink")
                self.reply("250 8BITMIME")
            elif verb == "MAIL":
                sender = line.split(":", 1)[1].strip().strip("<>")
                self.reply("250 OK")
            elif verb == "RCPT":
                recipients.append(line.split(":", 1)[1].strip().strip("<>"))
                self.reply("250 OK")
            elif verb == "DATA":
                self.reply("354 End data with <CR><LF>.<CR><LF>")
                body = bytearray()
                while True:
                    chunk = self.rfile.readline()
                    if chunk in (b".\r\n", b".\n", b""):
                        break
                    body += chunk[1:] if chunk.startswith(b"..") else chunk
                parsed = message_from_bytes(bytes(body))
                text = ""
                for part in parsed.walk():
                    if part.get_content_type() == "text/plain":
                        text = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                        break
                with lock:
                    messages.append(
                        {
                            "from": sender,
                            "to": recipients,
                            "subject": str(make_header(decode_header(parsed.get("Subject", "")))),
                            "text": text,
                        }
                    )
                sender, recipients = None, []
                self.reply("250 OK")
            elif verb == "QUIT":
                self.reply("221 Bye")
                return
            elif verb in ("RSET", "NOOP"):
                self.reply("250 OK")
            else:
                self.reply("250 OK")


class Http(BaseHTTPRequestHandler):
    def do_GET(self):
        with lock:
            body = json.dumps(messages).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_DELETE(self):
        with lock:
            messages.clear()
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    smtp = Server(("0.0.0.0", 1025), Smtp)
    threading.Thread(target=smtp.serve_forever, daemon=True).start()
    print("mail sink: SMTP on 1025, messages at http://0.0.0.0:8025/", flush=True)
    HTTPServer(("0.0.0.0", 8025), Http).serve_forever()
