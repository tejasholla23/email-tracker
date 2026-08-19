"use strict";

/**
 * Recursively extracts attachment metadata from a Gmail message payload.
 *
 * @param {Object} payload - Gmail message payload from messages.get(format: "full")
 * @param {string} messageId - Gmail message ID this payload belongs to
 * @returns {Array<Object>} List of attachment metadata objects
 */
function extractAttachmentMetadata(payload, messageId) {
  const attachments = [];
  if (!payload) return attachments;

  function walk(part) {
    if (!part) return;

    // Only parts with a body.attachmentId represent retrievable attachments
    if (part.body && part.body.attachmentId) {
      const headers = part.headers || [];
      const getHeader = (name) =>
        (headers.find((h) => h.name && h.name.toLowerCase() === name.toLowerCase()) || {}).value || "";

      const contentDisposition = getHeader("Content-Disposition");
      const contentId = getHeader("Content-ID");
      const filename = part.filename || "";
      const mimeType = (part.mimeType || "").toLowerCase();
      const size = part.body.size || 0;

      // ── Inline detection heuristics ──
      // A part is considered inline (e.g. signature logo) if ANY of the following hold:
      //   1. Content-Disposition starts with "inline" AND has a Content-ID
      //   2. Has a Content-ID AND is an image/* AND has no filename (embedded CID image)
      //   3. Has a Content-ID AND is an image/* AND is small (< 50 KB, likely a logo)
      //   4. No filename at all and has a Content-ID (unnamed embedded resource)
      const hasContentId = !!contentId;
      const isImage = mimeType.startsWith("image/");
      const dispositionLower = contentDisposition.toLowerCase();
      const isDispositionInline = dispositionLower.startsWith("inline");
      const isDispositionAttachment = dispositionLower.startsWith("attachment");
      const isSmallImage = isImage && size < 50000; // < ~50 KB

      let isInline = false;

      if (isDispositionAttachment) {
        // Explicitly marked as attachment — always treat as real attachment
        isInline = false;
      } else if (isDispositionInline && hasContentId) {
        isInline = true;
      } else if (hasContentId && isImage && !filename) {
        isInline = true;
      } else if (hasContentId && isSmallImage) {
        isInline = true;
      } else if (!filename && hasContentId) {
        isInline = true;
      }

      attachments.push({
        messageId,
        attachmentId: part.body.attachmentId,
        filename: filename,
        mimeType: part.mimeType || "",
        size: size,
        isInline,
      });
    }

    // Recurse into child parts (handles multipart/*, message/rfc822, forwarded emails)
    if (part.parts && Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return attachments;
}

/**
 * Merges newly extracted attachments into an existing attachments array,
 * deduplicating by the composite key (messageId + attachmentId).
 *
 * @param {Array<Object>} existingAttachments
 * @param {Array<Object>} newAttachments
 * @returns {Array<Object>} Merged attachments array
 */
function mergeAttachments(existingAttachments = [], newAttachments = []) {
  if (!newAttachments || newAttachments.length === 0) {
    return existingAttachments || [];
  }
  const existing = existingAttachments || [];
  const existingKeys = new Set(existing.map((a) => `${a.messageId}:${a.attachmentId}`));
  const toAdd = newAttachments.filter((a) => !existingKeys.has(`${a.messageId}:${a.attachmentId}`));
  return [...existing, ...toAdd];
}

module.exports = {
  extractAttachmentMetadata,
  mergeAttachments,
};
