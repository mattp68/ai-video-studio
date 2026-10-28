/* Local review notes, independent of assistant accounts and approval decisions. */
window.ProjectFeedback = (() => {
  let target = null, data = null, loading = 0, busy = false;
  const drafts = new Map(), saves = new Map();
  async function reply(response) {
    try { return await response.json(); } catch { throw Error('The studio could not load feedback. Check its connection and try again.'); }
  }
  const key = t => [t.project.id, t.artifact.id, t.frame ?? ''].join('/');
  const timeLabel = t => { const ticks = Math.round(t * 100); return `${Math.floor(ticks / 6000)}:${((ticks % 6000) / 100).toFixed(2).padStart(5, '0')}`; };
  const openNotes = () => (data?.notes || []).filter(n => n.status === 'open');
  const versionNotes = () => openNotes().filter(n => n.artifact_id === target?.artifact.id);
  function retain() {
    const text = document.querySelector('#feedback-text');
    if (target && text) drafts.set(key(target), {text: text.value, time: target.time});
  }
  function contextLabel(t) {
    return t.frame ? `${t.artifact.type === 'carousel' ? 'Slide' : 'Scene'} ${t.frame}` :
      t.time !== null ? `At ${timeLabel(t.time)}` : 'Whole version';
  }
  function noteLink(n) {
    const q = new URLSearchParams({project: target.project.id, artifact: n.artifact_id});
    if (n.frame) q.set('frame', n.frame);
    if (n.time !== null) q.set('time', n.time);
    return '#' + q;
  }
  function noteCards(notes) {
    return notes.map(n => `<article${data?.selection?.note_ids.includes(n.id) ? ' class="linked-feedback-note"' : ''}><a href="${esc(noteLink(n))}">${esc(n.frame ? `Scene ${n.frame}` : n.time !== null ? timeLabel(n.time) : 'Whole version')}</a><p>${esc(n.text)}</p></article>`).join('');
  }
  function paint() {
    const box = document.querySelector('#feedback-panel');
    if (!box || !target) return;
    const notes = openNotes(), current = versionNotes(), attached = target.time !== null;
    const version = target.artifact.version || target.artifact.label;
    const linked = data?.selection, completed = linked ? data.notes.filter(n => linked.note_ids.includes(n.id) && n.status !== 'open').length : 0;
    box.innerHTML = `<div class="feedback-heading"><h4>Your feedback</h4>
      <button class="text-button" data-feedback-list ${!data ? 'disabled' : ''}>All saved notes (${notes.length})</button></div>
      ${linked ? `<p class="feedback-link-context">This feedback link identifies ${linked.note_ids.length} saved ${linked.note_ids.length === 1 ? 'note' : 'notes'}${completed ? ` · ${completed} already applied` : ''}.</p>` : ''}
      <div class="feedback-context ${attached ? 'is-attached' : ''}" id="feedback-position" role="status">${attached ? `<span><span aria-hidden="true">✓</span> Note time: <strong>${esc(timeLabel(target.time))}</strong> · ${esc(version)}</span><span class="moment-options"><button data-feedback-remove-moment ${busy ? 'disabled' : ''}>Remove</button></span>` : `<span>${esc(version)} · ${esc(contextLabel(target))}</span>`}</div>
      <label class="sr-only" for="feedback-text">Feedback for this version</label>
      <textarea id="feedback-text" maxlength="2000" rows="3" ${busy ? 'disabled' : ''} placeholder="What would you like to change?">${esc(drafts.get(key(target))?.text || '')}</textarea>
      <div class="feedback-actions">${target.artifact.type === 'video' ? `<button class="secondary moment-button" data-feedback-moment ${busy ? 'disabled' : ''} title="Add or replace the timestamp using the video’s current position">Add timestamp</button>` : ''}
      <button class="primary" data-feedback-save ${!data?.contexts?.[target.artifact.id] || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save feedback'}</button></div>
      <p id="feedback-status" role="status">${data ? 'Save your note here, then copy feedback to your editing chat.' : 'Loading saved feedback…'}</p>
      <div class="feedback-notes" aria-label="Saved notes on this version">${current.length ? `<h5>Saved on this version (${current.length})</h5>${noteCards(current)}` : ''}</div>
      ${current.length ? `<section class="feedback-handoff" aria-label="Send saved feedback to your editing chat"><div><h5>Ready for your editing chat</h5><p><strong>${current.length} saved ${current.length === 1 ? 'note' : 'notes'} · ${esc(version)}</strong></p></div><button class="primary" data-feedback-copy="version" ${busy ? 'disabled' : ''}>Copy feedback for chat</button><p>Copies a request for these exact notes. Paste it into your editing chat to apply them.</p><p class="feedback-copy-status" role="status"></p></section>` : ''}`;
  }
  async function render(project, artifact, frameIndex = 0) {
    retain();
    target = {project, artifact, frame: artifact.frames ? frameIndex + 1 : null, time: null};
    target.time = drafts.get(key(target))?.time ?? null;
    data = null;
    const token = ++loading;
    paint();
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      const selection = params.get('project') === project.id ? params.get('feedback') : null;
      const response = await fetch('/feedback?project=' + encodeURIComponent(project.id) + (selection !== null ? '&selection=' + encodeURIComponent(selection) : ''), {cache: 'no-store'});
      const result = await reply(response);
      if (!response.ok) { const error = Error(result.error || 'Saved notes could not load. Your draft is still here.'); error.selection = selection !== null; throw error; }
      if (token !== loading) return;
      if (result.selection?.artifact_id && result.selection.artifact_id !== artifact.id) { const error = Error('This feedback link refers to a different version. Use the original link or show this project’s feedback.'); error.selection = true; throw error; }
      retain(); data = result; paint();
    } catch (error) {
      if (token === loading && document.querySelector('#feedback-status')) {
        const status = document.querySelector('#feedback-status');
        status.textContent = (error instanceof TypeError ? 'Could not reach your local studio.' : error.message) + ' Reopen this version to retry.';
        if (error.selection) { const button = document.createElement('button'); button.className = 'text-button'; button.dataset.feedbackShowProject = ''; button.textContent = 'Show project feedback'; status.append(document.createElement('br'), button); }
      }
    }
  }
  function moment() {
    if (!target || busy) return;
    const video = document.querySelector('#project-artifact video');
    if (!video || target.artifact.type !== 'video' || !Number.isFinite(video.currentTime)) return;
    video.pause();
    retain(); target.time = Math.round(video.currentTime * 1000) / 1000;
    drafts.set(key(target), {...drafts.get(key(target)), time: target.time});
    paint();
    document.querySelector('#feedback-status').textContent = `Timestamp set to ${timeLabel(target.time)}. Write your note, then save.`;
    document.querySelector('#feedback-text')?.focus();
  }
  function removeMoment() {
    if (!target || busy) return;
    retain(); target.time = null;
    drafts.set(key(target), {...drafts.get(key(target)), time: null});
    paint();
    document.querySelector('#feedback-status').textContent = 'Timestamp removed. This note will apply to the whole version.';
    document.querySelector('#feedback-text')?.focus();
  }
  async function save() {
    const text = document.querySelector('#feedback-text');
    if (busy || !target || !data || !text?.value.trim()) {
      if (text && !text.value.trim()) { text.focus(); document.querySelector('#feedback-status').textContent = 'Write a note first.'; }
      return;
    }
    retain();
    const destination = target, token = key(target), position = contextLabel(target);
    let body = {project_id: target.project.id, artifact_id: target.artifact.id,
      context_revision: data.contexts[target.artifact.id], text: text.value,
      time: target.time, frame: target.frame, request_id: crypto.randomUUID()};
    const signature = JSON.stringify({...body, request_id: null});
    if (saves.get(token)?.signature === signature) body = saves.get(token).body;
    else saves.set(token, {signature, body});
    busy = true;
    paint();
    document.querySelector('#feedback-status').textContent = 'Saving…';
    try {
      const response = await fetch('/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Studio-Action': 'feedback'}, body: JSON.stringify(body)});
      const result = await reply(response);
      if (!response.ok) { const error = Error(result.error || 'Feedback could not be saved. Your draft is still here.'); error.conflict = response.status === 409; throw error; }
      drafts.delete(token); saves.delete(token); busy = false;
      if (target === destination) {
        target.time = null; data = result; paint();
        const status = document.querySelector('#feedback-status');
        status.textContent = `✓ Feedback saved · ${position}. Use Copy feedback for chat when you’re ready.`;
        status.classList.add('feedback-saved');
      } else { retain(); paint(); }
      notify('Feedback saved. Copy it to your editing chat when you’re ready.');
    } catch (error) {
      busy = false;
      if (target !== destination) { retain(); paint(); }
      if (target === destination) {
        retain(); paint();
        document.querySelector('#feedback-status').textContent = error instanceof TypeError ? 'Could not reach your local studio. Your draft is preserved.' : error.message;
        if (error.conflict) {
          document.querySelector('[data-feedback-save]').disabled = true;
          const button = document.createElement('button'); button.className = 'secondary';
          button.dataset.feedbackRefresh = ''; button.textContent = 'Refresh this version';
          document.querySelector('#feedback-status').append(document.createElement('br'), button);
        }
      }
    }
  }
  function list() {
    if (!data || !target) return;
    const dialog = document.querySelector('#feedback-dialog'), notes = openNotes();
    dialog.querySelector('.feedback-all-scope').textContent = `${target.project.title} · ${notes.length} saved, unapplied ${notes.length === 1 ? 'note' : 'notes'} across all versions.`;
    dialog.querySelector('.saved-feedback-list').innerHTML = notes.length ? notes.map(n => `<article${data?.selection?.note_ids.includes(n.id) ? ' class="linked-feedback-note"' : ''}><a href="${esc(noteLink(n))}" data-close-feedback>${esc(n.label)} ${esc(n.version)} · ${esc(n.frame ? `Scene ${n.frame}` : n.time !== null ? timeLabel(n.time) : 'Whole version')}</a><p>${esc(n.text)}</p></article>`).join('') : '<p>No saved notes yet. Add one beside a preview.</p>';
    dialog.querySelector('[data-feedback-copy]').disabled = !notes.length;
    dialog.querySelector('[data-feedback-copy]').textContent = 'Copy all project feedback for chat';
    dialog.querySelector('.feedback-dialog-status').textContent = '';
    dialog.showModal();
  }
  async function copyNotes(all = false, button = null) {
    if (!target || !data || busy || button?.disabled) return;
    const destination = target, notes = all ? openNotes() : versionNotes();
    if (!notes.length) return;
    const project = target.project, version = target.artifact.version || target.artifact.label;
    const body = {project_id: project.id, artifact_id: all ? null : target.artifact.id, note_ids: notes.map(n => n.id)};
    const status = document.querySelector(all ? '.feedback-dialog-status' : '.feedback-copy-status');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Preparing your feedback link…';
    let text;
    try {
      const response = await fetch('/feedback-link', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Studio-Action': 'feedback-link'}, body: JSON.stringify(body)});
      const selection = await reply(response);
      if (!response.ok) throw Error(selection.error || 'The feedback link could not be prepared. Try again.');
      if (!/^[a-f0-9]{24}$/.test(selection.id) || selection.project_id !== body.project_id || selection.artifact_id !== body.artifact_id || JSON.stringify(selection.note_ids?.slice().sort()) !== JSON.stringify(body.note_ids.slice().sort()))
        throw Error('The feedback link could not be verified. Reopen this version and copy again.');
      const link = new URL('#' + new URLSearchParams({project: project.id, ...(!all ? {artifact: destination.artifact.id} : {}), feedback: selection.id}), location.href);
      text = `Please use my ${notes.length} saved feedback ${notes.length === 1 ? 'note' : 'notes'} for ${project.title}${all ? ' (across project versions)' : ', ' + version}.\n${link.href}`;
    } catch (error) {
      if (status?.isConnected) status.textContent = error instanceof TypeError ? 'Could not reach your local studio. Your saved notes are preserved. Try again.' : error.message;
      if (button?.isConnected) button.disabled = false;
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (target === destination) {
        if (button?.isConnected) button.textContent = '✓ Request copied';
        if (status?.isConnected) status.textContent = 'Paste into your editing chat. The link identifies your saved notes; you can add more requests.';
      }
      notify('Request copied. Paste it into your editing chat.');
    } catch {
      const field = document.querySelector('#feedback-copy-text'); field.value = text;
      document.querySelector('#feedback-copy-dialog').showModal(); field.focus(); field.select();
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-feedback-moment]')) moment();
    if (event.target.closest('[data-feedback-remove-moment]')) removeMoment();
    if (event.target.closest('[data-feedback-save]')) save();
    if (event.target.closest('[data-feedback-list]')) list();
    if (event.target.closest('[data-feedback-refresh]')) window.Studio?.route();
    if (event.target.closest('[data-feedback-show-project]')) { const params = new URLSearchParams(location.hash.slice(1)); params.delete('feedback'); history.replaceState(null, '', '#' + params); window.Studio?.route(); }
    const copy = event.target.closest('[data-feedback-copy]');
    if (copy) copyNotes(copy.dataset.feedbackCopy === 'all', copy);
    if (event.target.closest('[data-close-feedback]')) document.querySelector('#feedback-dialog').close();
  });
  return {render, retain, moment, hasDraft: () => !!document.querySelector('#feedback-text')?.value.trim() || busy};
})();
