console.log("Service worker startups.");

this.addEventListener('install', function(event) {
  console.log("Service worker installed.");
});

this.addEventListener('activate', function(event) {
  console.log("Service worker activated.");
});

this.addEventListener('fetch', function(event) {
  console.log("Caught a fetch!");
  event.respondWith(new Response("Hello world!"));
});