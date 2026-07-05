// ============================================================================
// Cloudflare Worker — Vertex AI şeffaf proxy (temiz IP)
// ----------------------------------------------------------------------------
// Neden: Google, Render'ın çıkış IP'sini *.googleapis.com kenarında (GFE) 403
// ("Your client does not have permission") ile blokluyor. Auth token Render'da
// sorunsuz üretiliyor (oauth2.googleapis.com bloklu değil); sadece asıl API
// çağrısı bloklanıyor. Bu Worker, backend'in gönderdiği (zaten Bearer token'lı)
// isteği gerçek Vertex host'una iletir. Cloudflare IP'si bloklu olmadığı için
// Google kabul eder.
//
// KURULUM:
//  1) Cloudflare Dashboard > Workers & Pages > Create > Create Worker
//  2) Adı: gymbody-vertex-proxy > Deploy > "Edit code" > bu dosyanın TAMAMINI
//     yapıştır > Deploy.
//  3) Worker > Settings > Variables and Secrets > Add:
//        PROXY_SECRET = (rastgele uzun bir dize, örn. 40+ karakter)
//     Save and deploy.
//  4) Worker URL'sini kopyala (https://gymbody-vertex-proxy.<hesap>.workers.dev)
//  5) Render > gymbody > Environment'a ekle:
//        VERTEX_PROXY_URL    = https://gymbody-vertex-proxy.<hesap>.workers.dev
//        VERTEX_PROXY_SECRET = (3. adımdaki PROXY_SECRET ile AYNI değer)
// ============================================================================

export default {
  async fetch(request, env) {
    // Sadece bizim backend geçebilsin (açık proxy olmasın)
    if (env.PROXY_SECRET && request.headers.get('X-Proxy-Secret') !== env.PROXY_SECRET) {
      return new Response('forbidden', { status: 403 });
    }

    const url = new URL(request.url);
    // Yol örn: /v1beta1/projects/PROJ/locations/us-central1/publishers/google/models/...:generateContent
    const m = url.pathname.match(/\/locations\/([^/]+)(?:\/|$)/);
    const loc = m ? m[1] : 'global';
    const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    const target = `https://${host}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('x-proxy-secret');

    const init = { method: request.method, headers };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }

    const resp = await fetch(target, init);
    // İçerik kodlaması uyuşmazlığını önlemek için sade cevap dön
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: { 'content-type': resp.headers.get('content-type') || 'application/json' },
    });
  },
};
