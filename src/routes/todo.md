<!DOCTYPE html>
<html lang="en" data-theme="corporate">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PDS Agent — NovigiSuper</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --font-body: 'DM Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { font-family: var(--font-body); }
    code, .font-mono, .trace-step { font-family: var(--font-mono); }

    .chat-container {
      height: calc(100vh - 10rem);
    }

    .message-enter {
      animation: msgSlide 0.3s ease-out;
    }

    @keyframes msgSlide {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .trace-step {
      font-size: 0.8rem;
      line-height: 1.6;
      border-left: 3px solid;
      padding-left: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .trace-thought  { border-color: #6366f1; color: #818cf8; }
    .trace-action   { border-color: #f59e0b; color: #fbbf24; }
    .trace-observation { border-color: #10b981; color: #34d399; }
    .trace-review   { border-color: #ec4899; color: #f472b6; }

    .typing-dots span {
      animation: blink 1.4s infinite both;
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
      margin: 0 2px;
    }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes blink {
      0%, 80%, 100% { opacity: 0.2; }
      40% { opacity: 1; }
    }
  </style>
</head>
<body class="bg-base-200 min-h-screen">

  <!-- Navbar -->
  <div class="navbar bg-base-100 shadow-sm border-b border-base-300 px-6">
    <div class="flex-1 gap-3">
      <div class="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary-content" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div>
        <h1 class="text-lg font-bold leading-tight">PDS Agent</h1>
        <p class="text-xs opacity-50">NovigiSuper — Product Disclosure Statement</p>
      </div>
    </div>
    <div class="flex-none gap-2">
      <div class="badge badge-ghost gap-1 text-xs">
        <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
        gpt-4o-mini
      </div>
      <div class="badge badge-outline text-xs">ReAct + Reflect</div>
    </div>
  </div>

  <!-- Main Chat Area -->
  <div class="chat-container overflow-y-auto p-6 space-y-4" id="chatContainer">

    <!-- System welcome -->
    <div class="chat chat-start message-enter">
      <div class="chat-image avatar placeholder">
        <div class="bg-primary text-primary-content rounded-full w-10">
          <span class="text-sm font-bold">AI</span>
        </div>
      </div>
      <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300">
        <p class="font-medium">Welcome! I'm your PDS analysis agent.</p>
        <p class="text-sm opacity-70 mt-1">Ask me anything about the NovigiSuper Product Disclosure Statement. I'll search the document, calculate figures, and verify my answers against the source.</p>
        <div class="flex gap-2 mt-3 flex-wrap">
          <button class="btn btn-xs btn-outline" onclick="askSuggested(this)">What's the High Growth return?</button>
          <button class="btn btn-xs btn-outline" onclick="askSuggested(this)">Total annual fees on $100k?</button>
          <button class="btn btn-xs btn-outline" onclick="askSuggested(this)">Preservation age if born 1962?</button>
        </div>
      </div>
    </div>

    <!-- Example: User message -->
    <div class="chat chat-end message-enter">
      <div class="chat-bubble chat-bubble-primary">
        What is the High Growth target return?
      </div>
    </div>

    <!-- Example: Agent response with trace -->
    <div class="chat chat-start message-enter">
      <div class="chat-image avatar placeholder">
        <div class="bg-primary text-primary-content rounded-full w-10">
          <span class="text-sm font-bold">AI</span>
        </div>
      </div>
      <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300 max-w-2xl">
        <p>The High Growth target return depends on your product type:</p>
        <ul class="list-disc list-inside mt-2 space-y-1 text-sm">
          <li><strong>Current products</strong> (Section 4): <span class="badge badge-sm badge-success">8.5% p.a.</span></li>
          <li><strong>Legacy products</strong> (Section 9, pre-2020): <span class="badge badge-sm badge-warning">7.0% p.a.</span></li>
        </ul>
        <p class="text-sm opacity-70 mt-2">Note: Legacy High Growth also carries a higher fee of 1.2% p.a. vs the standard 0.60%.</p>

        <!-- Reasoning Trace (collapsible) -->
        <div class="collapse collapse-arrow bg-base-200 rounded-lg mt-3">
          <input type="checkbox" />
          <div class="collapse-title text-xs font-semibold py-2 min-h-0">
            Reasoning trace — 5 steps
          </div>
          <div class="collapse-content px-3">
            <div class="trace-step trace-thought">
              <span class="font-bold text-xs uppercase">Thought</span><br/>
              User asks about High Growth return. Section 1 mentions legacy members should check Section 9. I need to check both current and legacy.
            </div>
            <div class="trace-step trace-action">
              <span class="font-bold text-xs uppercase">Action</span><br/>
              lookup_pds_field("high_growth_current_return")
            </div>
            <div class="trace-step trace-observation">
              <span class="font-bold text-xs uppercase">Observation</span><br/>
              Section 4 → High Growth: 8.5% p.a., Risk: High
            </div>
            <div class="trace-step trace-action">
              <span class="font-bold text-xs uppercase">Action</span><br/>
              lookup_pds_field("high_growth_legacy_return")
            </div>
            <div class="trace-step trace-observation">
              <span class="font-bold text-xs uppercase">Observation</span><br/>
              Section 9 → High Growth (Legacy): 7.0% p.a., Fee override: 1.2%
            </div>
          </div>
        </div>

        <!-- Review badge -->
        <div class="flex items-center gap-2 mt-2">
          <div class="badge badge-success badge-sm gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
            Review: PASS
          </div>
          <span class="text-xs opacity-40">2 fields verified against source</span>
        </div>
      </div>
    </div>

    <!-- Example: Hallucination prevention demo -->
    <div class="chat chat-end message-enter">
      <div class="chat-bubble chat-bubble-primary">
        When can I access my super if I was born in 1962?
      </div>
    </div>

    <div class="chat chat-start message-enter">
      <div class="chat-image avatar placeholder">
        <div class="bg-primary text-primary-content rounded-full w-10">
          <span class="text-sm font-bold">AI</span>
        </div>
      </div>
      <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300 max-w-2xl">
        <div class="flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <div>
            <p class="font-medium">Not specified in the PDS.</p>
            <p class="text-sm opacity-70 mt-1">The preservation age table in Section 6 covers birth dates before 1 July 1961 (age 56) and after 1 July 1964 (age 60), but <strong>does not include the period between 1961 and 1964</strong>. I cannot provide a preservation age for someone born in 1962 without this data.</p>
          </div>
        </div>

        <div class="collapse collapse-arrow bg-base-200 rounded-lg mt-3">
          <input type="checkbox" />
          <div class="collapse-title text-xs font-semibold py-2 min-h-0">
            Reasoning trace — 3 steps
          </div>
          <div class="collapse-content px-3">
            <div class="trace-step trace-thought">
              <span class="font-bold text-xs uppercase">Thought</span><br/>
              User born in 1962. I need to find the preservation age for this birth year in Section 6.
            </div>
            <div class="trace-step trace-action">
              <span class="font-bold text-xs uppercase">Action</span><br/>
              search_pds_chunks("preservation age born 1962")
            </div>
            <div class="trace-step trace-observation">
              <span class="font-bold text-xs uppercase">Observation</span><br/>
              Section 6 has: before 1 July 1960 → 55, between 1 July 1960–30 June 1961 → 56, after 1 July 1964 → 60. Gap found: 1961–1964 not listed.
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 mt-2">
          <div class="badge badge-warning badge-sm gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" /></svg>
            Gap detected
          </div>
          <span class="text-xs opacity-40">Agent refused to interpolate missing data</span>
        </div>
      </div>
    </div>

    <!-- Typing indicator (hidden by default) -->
    <div class="chat chat-start hidden" id="typingIndicator">
      <div class="chat-image avatar placeholder">
        <div class="bg-primary text-primary-content rounded-full w-10">
          <span class="text-sm font-bold">AI</span>
        </div>
      </div>
      <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300">
        <div class="typing-dots flex items-center gap-1 py-1">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Input Area -->
  <div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 p-4">
    <div class="max-w-3xl mx-auto flex gap-3">
      <input
        type="text"
        id="chatInput"
        placeholder="Ask about the PDS..."
        class="input input-bordered flex-1 focus:input-primary"
        onkeydown="if(event.key==='Enter') sendMessage()"
      />
      <button class="btn btn-primary" onclick="sendMessage()">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
      </button>
    </div>
  </div>

  <script>
    function askSuggested(btn) {
      document.getElementById('chatInput').value = btn.textContent;
      sendMessage();
    }

    function sendMessage() {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;

      const container = document.getElementById('chatContainer');

      // Add user message
      const userBubble = document.createElement('div');
      userBubble.className = 'chat chat-end message-enter';
      userBubble.innerHTML = `<div class="chat-bubble chat-bubble-primary">${escapeHtml(msg)}</div>`;
      container.appendChild(userBubble);

      input.value = '';

      // Show typing indicator
      document.getElementById('typingIndicator').classList.remove('hidden');
      container.scrollTop = container.scrollHeight;

      // TODO: Replace with actual API call to /api/chat
      // fetch('/api/chat', { method: 'POST', body: JSON.stringify({ question: msg }) })
      //   .then(r => r.json())
      //   .then(data => renderResponse(data))

      // Simulated delay for demo
      setTimeout(() => {
        document.getElementById('typingIndicator').classList.add('hidden');

        const agentBubble = document.createElement('div');
        agentBubble.className = 'chat chat-start message-enter';
        agentBubble.innerHTML = `
          <div class="chat-image avatar placeholder">
            <div class="bg-primary text-primary-content rounded-full w-10">
              <span class="text-sm font-bold">AI</span>
            </div>
          </div>
          <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300">
            <p class="text-sm opacity-50 italic">Connect to /api/chat to see live responses.</p>
          </div>
        `;
        container.appendChild(agentBubble);
        container.scrollTop = container.scrollHeight;
      }, 1500);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>
