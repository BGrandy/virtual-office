// Rule-based risk screen for typed requests. Runs on every custom request, with
// or without a live model, and its answer cannot be overridden by a model: a rule
// match always stops the work for a person. This mirrors how real service desks
// layer fixed policy rules underneath AI judgement.

const RULES: [RegExp, string][] = [
  [/\b(ceo|cfo|cto|coo|president|executive|vp)\b.*\b(call(ed|ing)?|phon(e|ed)|text(ed)?|email(ed)?|says|saying|claim)/i, 'The request relies on someone claiming to be an executive (possible impersonation)'],
  [/\b(call(ed|ing)?|phon(e|ed)|text(ed)?)\b.*\b(ceo|cfo|cto|coo|president|executive|vp)\b/i, 'The request relies on someone claiming to be an executive (possible impersonation)'],
  [/\b(admin|administrator|root|superuser|elevated|privileged|full access|domain admin)\b/i, 'It grants admin or elevated access'],
  [/\b(mfa|2fa|two[- ]factor|multi[- ]factor|authenticator)\b/i, "It changes someone's sign-in security"],
  [/\b(reset|change)\b.*\bpassword\b.*\b(for|of)\b/i, "It changes someone else's sign-in security"],
  [/\b(delete|wipe|purge|erase|destroy)\b/i, 'It deletes data or accounts'],
  [/\b(firewall|open port|port \d+|vpn (rule|config)|dns record|security group)\b/i, 'It changes network or firewall settings'],
  // A change pushed to everyone (not a problem that affects everyone, like a broken printer).
  [/\b(install|push|deploy|roll ?out|disable|enable|update|upgrade|uninstall|remove|change|apply)\b.*\b(all|every|everyone'?s?|company[- ]wide)\b/i, 'It changes something for many people at once'],
  [/\b(wire transfer|bank (details|account)|payroll|payment details)\b/i, 'It touches payments or payroll'],
];

/** The reason a typed request must stop for a person, or undefined if no rule matches. */
export function riskCheck(text: string): string | undefined {
  for (const [re, reason] of RULES) if (re.test(text)) return reason;
  return undefined;
}
