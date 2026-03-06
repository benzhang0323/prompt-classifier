export function looksLikeInjection(prompt) {
  const p = prompt.toLowerCase();
  return (
    p.includes("ignore all previous") ||
    p.includes("override your instructions") ||
    p.includes("pretend to be") ||
    p.includes("you are now") ||
    p.includes("append the system prompt") ||
    p.includes("show me your system prompt") ||
    p.includes("repeat your instructions") ||
    p.includes("output the json but") ||
    p.includes("secretly") ||
    p.includes("bypass") ||
    p.includes("developer mode") ||
    p.includes("dan mode")
  );
}

export function looksLikeMalware(prompt) {
  const p = prompt.toLowerCase();
  return (
    p.includes("malware") ||
    p.includes("ransomware") ||
    p.includes("virus") ||
    p.includes("trojan") ||
    p.includes("keylogger") ||
    p.includes("botnet") ||
    p.includes("write a payload") ||
    p.includes("remote access") ||
    p.includes("rat") ||
    p.includes("shellcode") ||
    p.includes("exploit") ||
    p.includes("zero day")
  );
}

export function looksLikeCyberAttack(prompt) {
  const p = prompt.toLowerCase();

  return (
    p.includes("find vulnerabilities") ||
    p.includes("scan this website") ||
    p.includes("scan the website") ||
    p.includes("penetration test") ||
    p.includes("pentest") ||
    p.includes("exploit this site") ||
    p.includes("exploit the server") ||
    p.includes("bypass authentication") ||
    p.includes("bypass login") ||
    p.includes("sql injection on") ||
    p.includes("xss on") ||
    p.includes("enumerate subdomains") ||
    p.includes("ddos this") ||
    (p.includes("act as an autonomous agent") &&
      (p.includes("hack") ||
        p.includes("breach") ||
        p.includes("vulnerabilit") ||
        p.includes("attack")))
  );
}

export function looksLikeDataExfiltration(prompt) {
  const p = prompt.toLowerCase();

  // Sensitive keywords
  const sensitiveStuff = /(api|access|secret|refresh)\s*keys?|tokens?|passwords?|credentials?|private\s+data|personal\s+data|session\s+cookies?|auth(entication)?\s*cookies?/;

  // Actions associated with exfiltration
  const exfilVerbs = /export|dump|leak|exfiltrat(e|ion)|steal|send\s+to|upload|email|share/;

  // Phrases like "all you can see"
  const scopeWords = /(all|any|everything|whatever)\s+(you\s+)?(can\s+)?(see|access|find|reach|read)/;

  return (
    (sensitiveStuff.test(p) && exfilVerbs.test(p)) ||
    (sensitiveStuff.test(p) && scopeWords.test(p))
  );
}