export function safeLink(value) {
  if (!value) return '';
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function safeImage(value) {
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(value) && value.length < 2000000 ? value : '';
}
export function resolveSelection(target) {
  const event = target.closest('.event');
  if (event) return {kind:'event', id:event.dataset.id};
  const group = target.closest('.group-element');
  return group ? {kind:'group',id:group.dataset.group} : null;
}
