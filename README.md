# Market Lab

Market Lab is a browser-based, agent-based stock-market sandbox for exploring how trading strategies, decision-makers, information timing, and market activity interact.

## Run it

Open `index.html` in a modern browser. The app uses plain HTML, CSS, and JavaScript; no build step or package installation is required. An internet connection enables the optional web fonts, with system-font fallbacks available offline. There is currently no Python source code in this project.

## Publish on GitHub Pages

This repository includes a GitHub Actions workflow that deploys the site from the `main` branch. Push the project to a public repository named `market-lab`, then in GitHub open **Settings → Pages** and choose **GitHub Actions** as the build and deployment source. After the workflow completes, the public site will be available at `https://<your-github-username>.github.io/market-lab/`.

GitHub Pages serves this as a static site: every visitor runs a separate simulation in their own browser. Shared markets, multiplayer human trading, or server-side LLM integrations would require a backend.

## Configure a run

- Set up to 20 agents for each strategy: value seekers, trend riders, contrarians, and noise traders.
- Choose a decision-maker for each strategy group: **Scripted**, **LLM-style**, or **Human**.
- The browser has one human trading seat, so configure at most one human-controlled agent. Submit a buy or sell order for the next simulated minute. A future multi-user version will need a shared server.
- Adjust market volatility, price impact, and playback speed. Every simulation step is one simulated minute; playback speed controls how many minutes advance each real-time second.
- Runs use a visible experiment seed. Reuse the same seed and settings to replay the same scripted experiment; change or randomize the seed to test another stochastic path. Market shocks use a separate seeded stream from agent-specific randomness, so adding agents does not shift the shared exogenous market shocks.
- Start, pause, step, or reset. Changing the strategy counts, decision-makers, volatility, or price impact and starting again begins a fresh run.

## Information timing and influence

The market publishes synthetic company information on a fixed schedule. Before a release, its headline and valuation impact remain hidden. At publication, the underlying fair value changes. Scripted and LLM-style agents process the information after their individual response delays and update their own estimate of fair value. Human agents see published information in their trading desk and choose whether to act.

Filled orders become public after a simulated-minute delay. Automated agents use recent public trades as one input to their next decision. The **Information & influence trace** records publication, agent processing, orders, linked evidence, and the subsequent market repricing. Its **Decision rationale time series** records each automated agent's decision each minute—including holds—with the strategy inputs, fair-value gap, trend/sentiment, peer activity, signal, target position, and evidence references. Use the entity selector to focus on one agent. Rationale displays the deterministic factors used by this prototype; the LLM-style proxy does not generate natural-language reasoning. Human-submitted orders can include an optional participant-provided reason.

Download the trace as CSV for later analysis; the export includes decision records plus the run's seed and configuration. Evidence links describe observed influence paths; they are not proof of causality. To estimate causal effects, compare runs using the same seed while varying one factor at a time.

### LLM proxy versus a real LLM

The current **LLM-style** controller is only a local behavioral proxy. It combines strategy signals, valuation gaps, and observed order flow, and assigns a longer information-processing delay. It does **not** load, call, or otherwise use a language model. Its displayed rationale is the prototype's explicit input factors—not generated model reasoning.

Adding real LLM traders in a future modification would require more than changing the controller label. It would require integrating a model/provider, designing and versioning the agent prompts and structured action format, and routing requests through a server-side backend. Provider API keys must never be placed in this public repository or browser code. The backend would also need to manage and monitor:

- Tokenized prompt and context construction, including which market events, agent observations, and history are sent to each model.
- Per-agent and per-run token limits, usage accounting, budget caps, and estimated/actual costs.
- Provider rate limits, concurrency, timeouts, retries, and behavior when the model is unavailable or returns invalid output.
- Model selection/versioning, response latency as simulated or real decision time, and reproducibility (LLM responses are not guaranteed to repeat even with the same simulation seed).
- Logging sufficient to evaluate decisions without unnecessarily retaining sensitive human or provider data.

GitHub Pages alone cannot securely hold provider secrets or coordinate private model calls. A live LLM setup would need a backend service and a deliberate approach to cost controls and data handling.

## Model boundaries

Agents start with $10,000 and 35 shares, have cash- and inventory-constrained orders, and trade at the current price against a shared synthetic liquidity pool. Net order flow and configured volatility affect the next price. The simulation currently has one stock, no short selling, no transaction costs, no limit order book, and no shared multi-user human session. This is a simplified experimental model, not a historical backtester or a forecast of actual markets.
