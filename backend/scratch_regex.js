function extractFormLink(text = "") {
  // 1. Regex to extract URLs. Matches http:// or https://, followed by non-whitespace characters.
  // It stops at <, >, ", ', whitespace. It allows query parameters.
  const urlRegex = /https?:\/\/[^\s<>"'*]+/gi;
  const rawAll = text.match(urlRegex) || [];
  
  // Clean up any trailing punctuation like commas, dots, or closing parentheses if they are at the end
  const cleanedAll = rawAll.map(url => {
    return url.replace(/[.,;)]+$/, "");
  });

  // 2. Remove duplicates
  const uniqueUrls = [...new Set(cleanedAll)];

  // 5. Select the most relevant application URL
  const formsGle = uniqueUrls.find((u) => /forms\.gle\//i.test(u));
  const docsForms = uniqueUrls.find((u) => /docs\.google\.com\/forms\//i.test(u));
  const unstop = uniqueUrls.find((u) => /unstop\.com\//i.test(u));
  const brazen = uniqueUrls.find((u) => /brazenconnect\.com\//i.test(u));
  
  const primary = formsGle || docsForms || unstop || brazen || uniqueUrls[0] || "";
  
  return { primary, all: uniqueUrls, isForm: !!(formsGle || docsForms) };
}

const tests = [
  "Here is the form: <https://forms.gle/abc123XYZ> please fill it.",
  "Apply here: https://unstop.com/o/KoXsOLD/?ref=amcJFfEZ *Last Date to Register:* Sunday",
  "https://app.brazenconnect.com/a/asp-sdengineering/e/28N38 <https://app.brazenconnect.com/a/asp-sdengineering/e/28N38>* We would appreciate",
  "Link: https://example.com/apply?id=123&token=abc. Regards, Placement Cell",
  "Click [here](https://unstop.com/competition)"
];

tests.forEach((t, i) => {
  console.log(`Test ${i + 1}:`, extractFormLink(t));
});
