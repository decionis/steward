"use client";
import { useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  Check,
  Clock3,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  MERCHANTS,
  PRODUCTS,
  PreviewCatalog,
  type PreviewProduct,
} from "@/domain/PreviewCatalog";
import { useAgent } from "./UseAgent";
import { ProductArt } from "./ProductArt";
import { AgentPanel, AgentStatus } from "./AgentPanel";
import styles from "./Preview.module.css";

function ProductCard({
  product,
  saved,
  onSave,
}: {
  product: PreviewProduct;
  saved: boolean;
  onSave(): void;
}) {
  const merchant = PreviewCatalog.merchant(product.merchantId);
  return (
    <article className={styles.productCard}>
      <div className={styles.productArt}>
        <ProductArt kind={product.artwork} />
        <button
          className={`${styles.saveButton} ${saved ? styles.saved : ""}`}
          onClick={onSave}
          aria-label={`${saved ? "Remove" : "Save"} ${product.name}`}
          aria-pressed={saved}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
        </button>
      </div>
      <div className={styles.productBody}>
        <span className={styles.merchantLabel}>{merchant.name}</span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className={styles.productMeta}>
          <strong>
            ¥{product.price}
            <small> sample</small>
          </strong>
          <span>
            <Clock3 size={13} />
            {product.minutes} min
          </span>
        </div>
      </div>
    </article>
  );
}

export function DiscoveryView({
  available,
  saved,
  toggleSaved,
}: {
  available: boolean;
  saved: Set<string>;
  toggleSaved(id: string): void;
}) {
  const [prompt, setPrompt] = useState("");
  const [filter, setFilter] = useState("all");
  const [showSaved, setShowSaved] = useState(false);
  const agent = useAgent();
  const suggestions = [
    "Lunch in 20 minutes, under ¥60",
    "A thoughtful gift under ¥120",
    "A quiet coffee break",
  ];
  const visible = PRODUCTS.filter(
    (product) =>
      (filter === "all" || product.merchantId === filter) &&
      (!showSaved || saved.has(product.id)),
  );
  async function ask(text: string) {
    setPrompt(text);
    await agent.run({ mode: "discover", prompt: text });
  }
  return (
    <>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>01 / Personalized discovery</span>
        <h1>
          A better visit
          <br />
          starts with you<span>.</span>
        </h1>
        <p>
          A quick lunch, a thoughtful gift, a moment to pause.
          <br className={styles.desktopBreak} /> Tell Steward what would make
          your day.
        </p>
      </div>
      <section
        className={styles.promptCard}
        aria-label="Find something for your visit"
      >
        <div className={styles.assistantLabel}>
          <span className={styles.sparkleBox}>
            <Sparkles size={19} />
          </span>
          <div>
            <strong>Your everyday concierge</strong>
            <small>Recommendations from the sample merchant guide</small>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(prompt);
          }}
        >
          <label className={styles.srOnly} htmlFor="discover-prompt">
            What are you looking for?
          </label>
          <div className={styles.promptInput}>
            <input
              id="discover-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="I have 20 minutes before my next meeting…"
              maxLength={700}
              minLength={3}
              required
              disabled={agent.loading}
            />
            <button
              type="submit"
              disabled={!available || agent.loading || prompt.trim().length < 3}
              aria-label="Ask Steward"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
        <div className={styles.suggestionRow}>
          {suggestions.map((text) => (
            <button
              key={text}
              onClick={() => void ask(text)}
              disabled={!available || agent.loading}
            >
              {text}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
        <p className={styles.formNote}>
          Use a sample scenario. Your question is sent to an AI service; no
          personal details are needed.
        </p>
        <AgentStatus loading={agent.loading} error={agent.error} />
      </section>
      {agent.result && (
        <AgentPanel result={agent.result}>
          {agent.result.productIds.length > 0 && (
            <div className={styles.recommendations}>
              {agent.result.productIds.map((id) => {
                const product = PRODUCTS.find((item) => item.id === id)!;
                return (
                  <div className={styles.recommendation} key={id}>
                    <div className={styles.miniArt}>
                      <ProductArt kind={product.artwork} />
                    </div>
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {PreviewCatalog.merchant(product.merchantId).name} · ¥
                        {product.price}
                      </small>
                    </div>
                    <button
                      className={styles.smallButton}
                      onClick={() => toggleSaved(id)}
                    >
                      {saved.has(id) ? "Saved" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {agent.result.sections.length > 0 && (
            <div className={styles.answerNotes}>
              {agent.result.sections.map((section) => (
                <p key={section.title}>
                  <strong>{section.title}</strong> {section.body}
                </p>
              ))}
            </div>
          )}
        </AgentPanel>
      )}
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Small discoveries, close by</span>
          <h2>Meet your everyday favourites</h2>
        </div>
        <button
          className={`${styles.savedFilter} ${showSaved ? styles.filterActive : ""}`}
          onClick={() => setShowSaved(!showSaved)}
          aria-pressed={showSaved}
        >
          <Bookmark size={15} />
          {showSaved ? "Show all" : `Saved (${saved.size})`}
        </button>
      </div>
      <div className={styles.filterRow} aria-label="Filter sample merchants">
        {[{ id: "all", name: "All discoveries" }, ...MERCHANTS].map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? styles.filterActive : ""}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
          >
            {item.name}
          </button>
        ))}
        <span>
          <MapPin size={13} /> Fictional location & merchants
        </span>
      </div>
      <div className={styles.productGrid}>
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            saved={saved.has(product.id)}
            onSave={() => toggleSaved(product.id)}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <div className={styles.empty}>
          Your saved discoveries will appear here. Save a card to plan a sample
          visit.
        </div>
      )}
    </>
  );
}
