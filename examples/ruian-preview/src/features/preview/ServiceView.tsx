"use client";
import { useState } from "react";
import {
  ArrowUp,
  Check,
  MapPin,
  MessagesSquare,
  UserRound,
} from "lucide-react";
import { PreviewCatalog, type MerchantId } from "@/domain/PreviewCatalog";
import { useAgent } from "./UseAgent";
import { AgentPanel, AgentStatus } from "./AgentPanel";
import { MerchantSelector } from "./MerchantSelector";
import styles from "./Preview.module.css";

export function ServiceView({ available }: { available: boolean }) {
  const [merchantId, setMerchant] = useState<MerchantId>("juniper");
  const [question, setQuestion] = useState("");
  const [ticket, setTicket] = useState<{
    question: string;
    merchant: string;
    resolved: boolean;
  } | null>(null);
  const agent = useAgent();
  const merchant = PreviewCatalog.merchant(merchantId);
  const prompts = [
    "Where can I find you?",
    "Can I book a table?",
    "I need allergen information",
  ];
  async function ask(text: string) {
    setQuestion(text);
    await agent.run({ mode: "service", merchantId, prompt: text });
  }
  return (
    <>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>04 / Service moments</span>
        <h1>
          A useful answer.
          <br />A thoughtful handoff<span>.</span>
        </h1>
        <p>
          Turn a moment of uncertainty into a better experience.
          <br className={styles.desktopBreak} /> Give staff the context, so
          visitors don’t have to start again.
        </p>
      </div>
      <div className={styles.workspaceGrid}>
        <section className={styles.editorCard}>
          <div className={styles.cardHeading}>
            <MessagesSquare size={19} />
            <h2>Ask the everyday questions</h2>
          </div>
          <MerchantSelector
            id="service-merchant"
            value={merchantId}
            onChange={(value) => {
              setMerchant(value);
              agent.reset();
              setTicket(null);
            }}
          />
          <div className={styles.locationNote}>
            <MapPin size={18} />
            <div>
              <strong>{merchant.location}</strong>
              <small>{merchant.hours}</small>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label className={styles.srOnly} htmlFor="service-question">
              Your service question
            </label>
            <div className={styles.promptInput}>
              <input
                id="service-question"
                placeholder="What would you like to know?"
                value={question}
                maxLength={700}
                minLength={3}
                required
                onChange={(event) => {
                  setQuestion(event.target.value);
                  agent.reset();
                }}
              />
              <button
                disabled={
                  !available || agent.loading || question.trim().length < 3
                }
                aria-label="Ask a service question"
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          <div className={styles.servicePrompts}>
            {prompts.map((text) => (
              <button
                key={text}
                disabled={!available || agent.loading}
                onClick={() => void ask(text)}
              >
                {text}
              </button>
            ))}
          </div>
          <AgentStatus loading={agent.loading} error={agent.error} />
          <p className={styles.formNote}>
            Sample location and hours. Live queues, bookings and staff messaging
            are not connected.
          </p>
        </section>
        <aside className={styles.handoffCard}>
          <div className={styles.cardHeading}>
            <UserRound size={19} />
            <h2>Staff handoff preview</h2>
          </div>
          {ticket ? (
            <>
              <span className={styles.draftBadge}>
                DEMO-01 ·{" "}
                {ticket.resolved ? "Resolved in preview" : "Awaiting review"}
              </span>
              <h3>{ticket.merchant}</h3>
              <p>{ticket.question}</p>
              <div className={styles.ticketNote}>
                Created in this browser only. No member of staff was notified.
              </div>
              <button
                className={styles.secondaryButton}
                disabled={ticket.resolved}
                onClick={() => setTicket({ ...ticket, resolved: true })}
              >
                <Check size={15} />
                {ticket.resolved ? "Demo resolved" : "Resolve in preview"}
              </button>
            </>
          ) : (
            <div className={styles.handoffEmpty}>
              <MessagesSquare size={30} />
              <h3>Context makes a difference.</h3>
              <p>
                Ask a question, then create a demo handoff. The visitor’s
                question stays with the request.
              </p>
            </div>
          )}
        </aside>
      </div>
      {agent.result && (
        <AgentPanel result={agent.result}>
          <div className={styles.serviceSteps}>
            {agent.result.sections.map((section) => (
              <div key={section.title}>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </div>
            ))}
          </div>
          <div className={styles.outputActions}>
            <button
              className={styles.primaryButton}
              onClick={() =>
                setTicket({
                  question,
                  merchant: merchant.name,
                  resolved: false,
                })
              }
            >
              <UserRound size={16} />
              Create demo handoff
            </button>
            <small>
              This simulates the handoff. It does not contact the merchant.
            </small>
          </div>
        </AgentPanel>
      )}
    </>
  );
}
