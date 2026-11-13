/*
 * Rootwell giving page embed (fundraising Phase 1).
 *
 * A nonprofit pastes this where the form should appear on its own website:
 *   <script src="https://<rootwell>/embed.js" data-rootwell-give="<page slug>" async></script>
 *
 * It puts the giving page in a frame right after the script tag and keeps the frame as tall
 * as the form. Stripe Checkout will not run inside a frame, so when the donor presses Give the
 * frame asks this script to open checkout in the full window. It only does that for messages
 * from Rootwell itself, and only to Stripe's checkout or Rootwell's own address.
 *
 * Plain JavaScript with no dependencies, so it runs on any site, including WordPress.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-rootwell-give") || "";
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    if (window.console) console.warn("Rootwell embed: data-rootwell-give should be a giving page's address name, like help-the-animals.");
    return;
  }
  var origin = new URL(script.src).origin;

  var frame = document.createElement("iframe");
  frame.src = origin + "/give/" + slug + "?embed=1";
  frame.title = "Give online";
  frame.loading = "lazy";
  frame.style.width = "100%";
  frame.style.maxWidth = "36rem";
  frame.style.minHeight = "32rem";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.setAttribute("allow", "payment");
  script.parentNode.insertBefore(frame, script.nextSibling);

  function allowed(url) {
    try {
      var u = new URL(url);
      return u.protocol === "https:" ? u.hostname === "checkout.stripe.com" || u.origin === origin : u.origin === origin;
    } catch {
      return false;
    }
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || e.source !== frame.contentWindow || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "rootwell:height" && typeof e.data.height === "number") {
      frame.style.height = Math.max(200, Math.min(4000, Math.ceil(e.data.height))) + "px";
    } else if (e.data.type === "rootwell:checkout" && typeof e.data.url === "string" && allowed(e.data.url)) {
      frame.contentWindow.postMessage({ type: "rootwell:checkout-ok" }, origin);
      window.location.href = e.data.url;
    }
  });
})();
