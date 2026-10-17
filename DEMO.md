# 60-Second Walkthrough: Reply Desk

This quick walkthrough demonstrates how a small business owner uses Reply Desk to turn an intimidating review into a professional, ready-to-post reply in seconds—running completely offline.

---

### Step 1: Open the App & Check Status (00:00 – 00:10)
1. Start Reply Desk with `npm run dev` and navigate to `http://localhost:3000`.
2. Notice the quiet, flat utility design inspired by Linear and Notion.
3. Look at the lower left sidebar:
   - Green indicator: `gemma3:1b` • **Running offline**
   - Confirming zero external network calls and zero subscription fees.

---

### Step 2: Handle a 5-Star Review with Streaming (00:10 – 00:25)
1. In the top-right **Sample review** dropdown, select:
   `5★ Maple Street Bakery (positive)`
2. Notice:
   - The review is populated in the left pane.
   - 5 stars are selected.
   - Detected sentiment automatically shows **Positive** with a green dot.
3. Click the primary **Generate reply** button.
4. Watch the tokens stream directly into the right pane.
5. Observe the output:
   - Genuine, warm appreciation referencing the almond croissants.
   - Automatically ends with the owner's configured sign-off (*"Sarah & the Maple Street Team"*).
   - Word count appears in the bottom right.

---

### Step 3: Copy in One Click (00:25 – 00:35)
1. Click the **Copy** button at the top of the right pane.
2. The button temporarily displays **Copied** with a checkmark.
3. The reply is now on your clipboard, ready to paste directly into Google Business Profile, Yelp, or TripAdvisor.

---

### Step 4: De-escalate a Difficult 1-Star Review (00:35 – 00:45)
1. In the **Sample review** dropdown, select:
   `1★ Chain Reaction Cycles (negative)`
2. Notice how the app instantly adapts:
   - Detected sentiment displays **Negative** with a subtle red dot.
   - The Tone automatically shifts to **Apologetic**.
3. Click **Generate reply** (or **Regenerate**).
4. Review the generated response:
   - It acknowledges the frustration calmly without making defensive excuses.
   - It references only the specific issues raised (delay and slipping chain).
   - It invites the customer to discuss directly with the shop.
   - It strictly adheres to the "Never Say" rules: no unauthorized refund promises and no legal fault admitted.

---

### Step 5: History & Search (00:45 – 00:55)
1. Click **History** in the sidebar.
2. Notice both generated replies are already logged with timestamp, star rating, tone, and full text.
3. Type `"croissants"` or `"bike"` into the search box to see real-time filtering.
4. Use **Copy reply** or **Load into editor** to reuse any previous response.

---

### Step 6: Local Business Profile (00:55 – 01:00)
1. Click **Business profile** in the sidebar.
2. Point out the configurable fields:
   - Business name & type
   - Owner name & preferred sign-off
   - Tone notes (*"Warm, sincere, casual..."*)
   - Strict negative constraints (*"Never promise refunds, discounts, or free items..."*)
3. Everything is saved locally in `data/db.json` on the owner's computer.
