(function () {
  // api helper for staff pages
  window.KENBRIDGE_API = (function () {
    const API_BASE = "https://kenbridge-christian-school.onrender.com";

    function getToken() {
      const keys = ["kenbridgeAccessToken", "access_token", "kenbridge_access_token", "token"];
      for (const k of keys) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (v) return v;
      }
      return null;
    }

    function authHeaders(extra = {}) {
      const token = getToken();
      const base = Object.assign({ "Content-Type": "application/json" }, extra || {});
      if (token) base.Authorization = "Bearer " + token;
      return base;
    }

    async function request(pathOrUrl, options = {}) {
      const url = String(pathOrUrl).startsWith("http")
        ? pathOrUrl
        : API_BASE + (String(pathOrUrl).startsWith("/") ? pathOrUrl : "/" + pathOrUrl);

      const opts = Object.assign({ method: "GET", headers: {} }, options || {});
      opts.headers = Object.assign({}, opts.headers || {}, authHeaders(opts.headers));

      const controller = new AbortController();
      opts.signal = controller.signal;
      const timeout = setTimeout(() => controller.abort(), opts.timeout || 15000);

      try {
        const res = await fetch(url, opts);
        clearTimeout(timeout);
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            // do not auto-clear session here; caller may handle redirect
          }
          const message = data?.message || `Request failed (${res.status})`;
          const err = new Error(message);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data ?? {};
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error('Request timed out.');
        throw err;
      }
    }

    return {
      API_BASE,
      getToken,
      authHeaders,
      request
    };
  })();
})();
