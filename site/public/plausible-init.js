// Plausible's init stub, as a same-origin file so the CSP can stay free of
// inline scripts. Loaded only when PLAUSIBLE_SCRIPT_SRC was set at build time.
window.plausible =
  window.plausible ||
  function () {
    ;(plausible.q = plausible.q || []).push(arguments)
  }
plausible.init =
  plausible.init ||
  function (i) {
    plausible.o = i || {}
  }
plausible.init()
