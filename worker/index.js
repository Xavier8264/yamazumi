// Reverse proxy that puts the Pages deployment on the personal domain:
//
//   jordanprunty.com/yamazumi/*  ->  yamazumi.pages.dev/yamazumi/*
//
// The Pages build already nests the app under /yamazumi/, so the path passes
// through untouched and only the host changes. Update ORIGIN if the Pages
// project is created under a different name.

const ORIGIN = 'https://yamazumi.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Bare /yamazumi -> the directory index. Handled here rather than in
    // _redirects so the Location header stays on this domain.
    if (url.pathname === '/yamazumi') {
      return Response.redirect(url.origin + '/yamazumi/', 301);
    }

    const upstream = new URL(url.pathname + url.search, ORIGIN);
    const response = await fetch(new Request(upstream, request), {
      redirect: 'manual',
    });

    // Any redirect the origin does emit points at *.pages.dev; rewrite it so
    // the browser is not bounced off the custom domain.
    const location = response.headers.get('location');
    if (location === null || !location.startsWith(ORIGIN)) {
      return response;
    }
    const rewritten = new Response(response.body, response);
    rewritten.headers.set('location', location.slice(ORIGIN.length));
    return rewritten;
  },
};
