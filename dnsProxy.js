const dns = require("dns");

const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

const FORCE_DOH = /^(1|true|yes)$/i.test(process.env.DNS_PROXY_FORCE || "");

function dnsError(code, hostname) {
  const err = new Error(`querySrv ${code} ${hostname}`);
  err.code = code;
  err.hostname = hostname;
  err.syscall = "querySrv";
  return err;
}

async function dohQuery(name, type) {
  let lastError;

  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = await res.json();

      if (body.Status !== 0) {
        throw dnsError(body.Status === 3 ? "ENOTFOUND" : "ENODATA", name);
      }

      return body.Answer || [];
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || dnsError("EAI_AGAIN", name);
}

function parseSrv({ data }) {
  const [priority, weight, port, ...target] = String(data).trim().split(/\s+/);

  return {
    priority: Number(priority) || 0,
    weight: Number(weight) || 0,
    port: Number(port) || 27017,
    name: target.join(" ").replace(/\.$/, ""),
  };
}

function parseTxt({ data }) {
  const parts = [...String(data).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return parts.length ? parts : [String(data)];
}

async function resolveSrvDoh(hostname) {
  const answers = await dohQuery(hostname, "SRV");
  const records = answers.filter((a) => a.type === 33).map(parseSrv);

  if (!records.length) throw dnsError("ENODATA", hostname);

  return records;
}

async function resolveTxtDoh(hostname) {
  const answers = await dohQuery(hostname, "TXT");
  return answers.filter((a) => a.type === 16).map(parseTxt);
}

let installed = false;

function installDnsProxy() {
  if (installed) return;
  installed = true;

  const nativeResolveSrv = dns.promises.resolveSrv;
  const nativeResolveTxt = dns.promises.resolveTxt;

  dns.promises.resolveSrv = async (hostname) => {
    if (FORCE_DOH) return resolveSrvDoh(hostname);

    try {
      return await nativeResolveSrv.call(dns.promises, hostname);
    } catch (err) {
      console.warn(
        `[dns-proxy] SRV via system DNS failed (${err.code || err.message}) for ${hostname}; retrying over DoH`
      );
      return resolveSrvDoh(hostname);
    }
  };

  dns.promises.resolveTxt = async (hostname) => {
    if (FORCE_DOH) return resolveTxtDoh(hostname);

    try {
      return await nativeResolveTxt.call(dns.promises, hostname);
    } catch (err) {
      console.warn(
        `[dns-proxy] TXT via system DNS failed (${err.code || err.message}) for ${hostname}; retrying over DoH`
      );
      return resolveTxtDoh(hostname);
    }
  };
}

module.exports = { installDnsProxy, resolveSrvDoh, resolveTxtDoh };
