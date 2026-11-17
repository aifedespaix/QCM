// Enregistre le service worker (hors connexion). Chargé uniquement dans le build de production.
if ('serviceWorker' in navigator) {
  var register = function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {})
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}
