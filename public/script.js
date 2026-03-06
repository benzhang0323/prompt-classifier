const $ = (id) => document.getElementById(id);

const inputEl = $("prompt-input");
const btnEl = $("analyze-btn");
const panelEl = $("result-panel");
const riskBadgeEl = $("risk-badge");
const allowedTextEl = $("allowed-text");
const categoriesTextEl = $("categories-text");
const reasonTextEl = $("reason-text");
const recsListEl = $("recs-list");
const promptEchoEl = $("prompt-echo");
const resultSourceEl = $("result-source");
const tsEl = $("result-timestamp");
// Optional debug element
const rawJsonEl = $("raw-json");

// ----- Auto-resize textarea -----
if (inputEl) {
  const autoResize = () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
  };
  inputEl.addEventListener("input", autoResize);
  autoResize();
}

// ----- Risk helpers -----
function riskToClass(risk) {
  const r = (risk || "").toLowerCase();
  if (r === "low") return "badge-low";
  if (r === "medium") return "badge-medium";
  if (r === "high") return "badge-high";
  return "badge-unknown";
}

function formatTimestamp(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

// ----- Render the result card -----
function renderResult(record) {
  const { analysis, prompt, createdAt } = record;

  const risk = analysis?.risk_level || "unknown";
  const allowed = !!analysis?.allowed;
  const cats = analysis?.categories || [];
  const reason = analysis?.reason || "No reason provided.";
  const recs = analysis?.recommendations || [];

  // Badge
  riskBadgeEl.textContent = `RISK: ${risk.toUpperCase()}`;
  riskBadgeEl.className = `badge ${riskToClass(risk)}`;

  // Allowed flag
  allowedTextEl.textContent = allowed ? "YES" : "NO";

  // Categories
  categoriesTextEl.textContent = cats.length ? cats.join(", ") : "none";

  // Reason
  reasonTextEl.textContent = reason;

  // Recommendations
  recsListEl.innerHTML = "";
  if (recs.length) {
    for (const r of recs) {
      const li = document.createElement("li");
      li.textContent = r;
      recsListEl.appendChild(li);
    }
  } else {
    const li = document.createElement("li");
    li.textContent = "No specific recommendations.";
    recsListEl.appendChild(li);
  }

  // Prompt echo
  promptEchoEl.textContent = prompt;

  // Meta
  resultSourceEl.textContent = "Source: LLM classifier";
  resultSourceEl.classList.add("meta-pill");

  tsEl.textContent = createdAt ? formatTimestamp(createdAt) : "";
  tsEl.classList.add("meta-pill");

  // Optional: raw JSON debug view (only if the HTML element exists)
  if (rawJsonEl) {
    // Only show the public analysis object, not internal record fields
    rawJsonEl.textContent = JSON.stringify(analysis, null, 2);
  }

  panelEl.classList.remove("hidden");
}

// ----- Call backend /analyze -----
async function analyzePrompt(prompt) {
  btnEl.disabled = true;

  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const text = await res.text();
      const record = {
        id: `error_${Date.now()}`,
        prompt,
        analysis: {
          risk_level: "unknown",
          categories: ["api_error"],
          allowed: false,
          reason: `Backend error: ${text || res.status}`,
          recommendations: ["Inspect your Worker logs for more details."]
        },
        createdAt: new Date().toISOString()
      };
      renderResult(record);
      return;
    }

    const record = await res.json();
    // Worker returns { id, prompt, analysis, createdAt }
    renderResult(record);
  } catch (err) {
    const record = {
      id: `error_${Date.now()}`,
      prompt,
      analysis: {
        risk_level: "unknown",
        categories: ["network_error"],
        allowed: false,
        reason: `Request failed: ${err && err.message ? err.message : String(err)}`,
        recommendations: [
          "Check your network connection.",
          "Verify the Worker is running (`wrangler dev` or deployed URL)."
        ]
      },
      createdAt: new Date().toISOString()
    };
    renderResult(record);
  } finally {
    btnEl.disabled = false;
  }
}

// ----- Wire up events -----
if (btnEl && inputEl) {
  btnEl.addEventListener("click", () => {
    const prompt = inputEl.value.trim();
    if (!prompt) return;
    analyzePrompt(prompt);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const prompt = inputEl.value.trim();
      if (!prompt) return;
      analyzePrompt(prompt);
    }
  });
}

// Hint chips — clicking fills the prompt and runs analysis
document.querySelectorAll(".hint-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const example = chip.getAttribute("data-example") || "";
    inputEl.value = example;
    inputEl.focus();
    inputEl.dispatchEvent(new Event("input"));
    analyzePrompt(example);
  });
});