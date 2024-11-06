console.info(`Running Bun ${Bun.version}`);

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = import.meta.dir + url.pathname;

    if (url.pathname.endsWith("/") || url.pathname.endsWith(".html")) {
      filePath = import.meta.dir + "/index.html";
    }

    const content = await Bun.file(filePath);

    if (await content.exists()) {
      return new Response(content, {
        headers: {
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Opener-Policy": "same-origin",
        },
      });
    }
    return new Response("404", {
      status: 404,
    });
  },
});
