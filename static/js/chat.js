// MotoAI chat na homepage. Odpoveď zo servera prichádza po kúskoch (stream),
// takže ju vypisujeme postupne – ako v ChatGPT.
const chatBox = document.getElementById("chat");
const messagesEl = document.getElementById("messages");
const input = document.getElementById("question");
const sendBtn = document.getElementById("send");
const loggedIn = chatBox.dataset.logged === "1";

let history = [];        // celá konverzácia – posiela sa AI, aby vedela o čom hovoríme
let controller = null;   // umožňuje odpoveď zastaviť

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

// **tučné** a nové riadky z odpovede AI prevedieme na HTML
function format(text) {
  const safe = text.replace(/</g, "&lt;");
  return safe.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

async function ask(question) {
  chatBox.classList.add("open");
  document.getElementById("tips").hidden = true;
  addMessage("user", question);
  history.push({ role: "user", content: question });

  const answerEl = addMessage("ai", "");
  answerEl.innerHTML = '<span class="typing">MotoAI premýšľa<span>.</span><span>.</span><span>.</span></span>';

  controller = new AbortController();
  sendBtn.textContent = "■";  // počas odpovede je tlačidlo "zastaviť"
  let answer = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      answerEl.innerHTML = format(answer);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  } catch (err) {
    answer += "\n(odpoveď zastavená)";
    answerEl.innerHTML = format(answer);
  }

  history.push({ role: "assistant", content: answer });
  controller = null;
  sendBtn.textContent = "➜";
}

document.getElementById("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (controller) return controller.abort();     // klik na štvorček = zastaviť
  if (!loggedIn) return (location.href = "/prihlasenie");
  if (input.value.trim()) ask(input.value.trim());
  input.value = "";
});

// tipy na otázky
document.querySelectorAll("#tips button").forEach((btn) => {
  btn.addEventListener("click", () => (loggedIn ? ask(btn.textContent) : (location.href = "/prihlasenie")));
});
