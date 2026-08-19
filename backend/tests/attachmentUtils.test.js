const test = require("node:test");
const assert = require("node:assert");
const { extractAttachmentMetadata, mergeAttachments } = require("../utils/attachmentUtils");

test("extractAttachmentMetadata: returns empty array for email with 0 attachments", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      {
        mimeType: "text/plain",
        body: { data: Buffer.from("Hello world").toString("base64") },
      },
      {
        mimeType: "text/html",
        body: { data: Buffer.from("<p>Hello world</p>").toString("base64") },
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_001");
  assert.strictEqual(attachments.length, 0);
});

test("extractAttachmentMetadata: extracts single PDF attachment correctly", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "text/html",
        body: { data: Buffer.from("<p>Please find attached JD.</p>").toString("base64") },
      },
      {
        mimeType: "application/pdf",
        filename: "Vyapar - Fresher Hiring 2026.pdf",
        headers: [
          { name: "Content-Disposition", value: 'attachment; filename="Vyapar - Fresher Hiring 2026.pdf"' },
          { name: "Content-Type", value: "application/pdf; name=\"Vyapar - Fresher Hiring 2026.pdf\"" },
        ],
        body: {
          attachmentId: "att_pdf_123",
          size: 245678,
        },
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_002");
  assert.strictEqual(attachments.length, 1);
  assert.strictEqual(attachments[0].messageId, "msg_002");
  assert.strictEqual(attachments[0].attachmentId, "att_pdf_123");
  assert.strictEqual(attachments[0].filename, "Vyapar - Fresher Hiring 2026.pdf");
  assert.strictEqual(attachments[0].mimeType, "application/pdf");
  assert.strictEqual(attachments[0].size, 245678);
  assert.strictEqual(attachments[0].isInline, false);
});

test("extractAttachmentMetadata: extracts multiple mixed attachments (PDF + XLSX)", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "text/plain",
        body: { data: Buffer.from("Interview schedule and shortlist").toString("base64") },
      },
      {
        mimeType: "application/pdf",
        filename: "Cognizant 2027 Assessment.pdf",
        headers: [{ name: "Content-Disposition", value: 'attachment; filename="Cognizant 2027 Assessment.pdf"' }],
        body: { attachmentId: "att_pdf_cog", size: 184500 },
      },
      {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "Ramaiah Institute Shortlist.xlsx",
        headers: [{ name: "Content-Disposition", value: 'attachment; filename="Ramaiah Institute Shortlist.xlsx"' }],
        body: { attachmentId: "att_xlsx_ramaiah", size: 52300 },
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_003");
  assert.strictEqual(attachments.length, 2);

  const pdf = attachments.find((a) => a.filename.endsWith(".pdf"));
  const xlsx = attachments.find((a) => a.filename.endsWith(".xlsx"));

  assert.ok(pdf);
  assert.strictEqual(pdf.attachmentId, "att_pdf_cog");
  assert.strictEqual(pdf.isInline, false);

  assert.ok(xlsx);
  assert.strictEqual(xlsx.attachmentId, "att_xlsx_ramaiah");
  assert.strictEqual(xlsx.size, 52300);
  assert.strictEqual(xlsx.isInline, false);
});

test("extractAttachmentMetadata: identifies inline signature logo correctly", () => {
  const payload = {
    mimeType: "multipart/related",
    parts: [
      {
        mimeType: "text/html",
        body: { data: Buffer.from('<p>Regards,<img src="cid:logo123"></p>').toString("base64") },
      },
      {
        mimeType: "image/png",
        filename: "vyapar_logo.png",
        headers: [
          { name: "Content-Disposition", value: 'inline; filename="vyapar_logo.png"' },
          { name: "Content-ID", value: "<logo123@msrit.edu>" },
        ],
        body: { attachmentId: "att_img_logo", size: 12400 },
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_004");
  assert.strictEqual(attachments.length, 1);
  assert.strictEqual(attachments[0].attachmentId, "att_img_logo");
  assert.strictEqual(attachments[0].isInline, true);
});

test("extractAttachmentMetadata: real attachment alongside inline signature image", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/related",
        parts: [
          {
            mimeType: "text/html",
            body: { data: Buffer.from('<p>Details attached.<img src="cid:footer_icon"></p>').toString("base64") },
          },
          {
            mimeType: "image/jpeg",
            filename: "footer.jpg",
            headers: [
              { name: "Content-Disposition", value: 'inline; filename="footer.jpg"' },
              { name: "Content-ID", value: "<footer_icon>" },
            ],
            body: { attachmentId: "att_sig_img", size: 8500 },
          },
        ],
      },
      {
        mimeType: "application/vnd.oasis.opendocument.text",
        filename: "Vyapar – Fresher Software Engineer Hiring (2026) NEW.odt",
        headers: [
          { name: "Content-Disposition", value: 'attachment; filename="Vyapar – Fresher Software Engineer Hiring (2026) NEW.odt"' },
        ],
        body: { attachmentId: "att_odt_doc", size: 27648 },
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_005");
  assert.strictEqual(attachments.length, 2);

  const real = attachments.filter((a) => !a.isInline);
  const inline = attachments.filter((a) => a.isInline);

  assert.strictEqual(real.length, 1);
  assert.strictEqual(real[0].filename, "Vyapar – Fresher Software Engineer Hiring (2026) NEW.odt");
  assert.strictEqual(real[0].attachmentId, "att_odt_doc");

  assert.strictEqual(inline.length, 1);
  assert.strictEqual(inline[0].attachmentId, "att_sig_img");
});

test("extractAttachmentMetadata: handles deeply nested forwarded email structure", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "message/rfc822",
        parts: [
          {
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename: "Job_Description.docx",
                headers: [{ name: "Content-Disposition", value: 'attachment; filename="Job_Description.docx"' }],
                body: { attachmentId: "att_fwd_docx", size: 34200 },
              },
            ],
          },
        ],
      },
    ],
  };

  const attachments = extractAttachmentMetadata(payload, "msg_006");
  assert.strictEqual(attachments.length, 1);
  assert.strictEqual(attachments[0].filename, "Job_Description.docx");
  assert.strictEqual(attachments[0].isInline, false);
});

test("mergeAttachments: deduplicates attachments with same messageId and attachmentId", () => {
  const existing = [
    { messageId: "msg_1", attachmentId: "att_1", filename: "Doc1.pdf", mimeType: "application/pdf", size: 100, isInline: false },
  ];
  const incoming = [
    { messageId: "msg_1", attachmentId: "att_1", filename: "Doc1.pdf", mimeType: "application/pdf", size: 100, isInline: false },
    { messageId: "msg_1", attachmentId: "att_2", filename: "Doc2.xlsx", mimeType: "application/xlsx", size: 200, isInline: false },
  ];

  const merged = mergeAttachments(existing, incoming);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].attachmentId, "att_1");
  assert.strictEqual(merged[1].attachmentId, "att_2");
});

test("mergeAttachments: preserves attachments from different messageIds (multi-email application)", () => {
  const existing = [
    { messageId: "msg_email1", attachmentId: "att_jd", filename: "Nutanix_JD.pdf", mimeType: "application/pdf", size: 150000, isInline: false },
  ];
  const newEmailAttachments = [
    { messageId: "msg_email2", attachmentId: "att_oa_sheet", filename: "Nutanix.xlsx", mimeType: "application/xlsx", size: 48000, isInline: false },
  ];

  const merged = mergeAttachments(existing, newEmailAttachments);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].messageId, "msg_email1");
  assert.strictEqual(merged[1].messageId, "msg_email2");
});

test("mergeAttachments: handles empty or undefined inputs safely", () => {
  assert.deepStrictEqual(mergeAttachments([], []), []);
  assert.deepStrictEqual(mergeAttachments(null, []), []);
  assert.deepStrictEqual(mergeAttachments(undefined, undefined), []);
  assert.strictEqual(mergeAttachments([{ attachmentId: "1" }], []).length, 1);
});
