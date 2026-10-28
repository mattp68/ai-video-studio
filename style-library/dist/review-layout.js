/* Presentation helpers. IDs, files and approval decisions remain in their existing registries. */
window.ReviewLayout = (() => {
  const h = esc;
  function stage(p, a) {
    if (labels[a.stage]) return a.stage;
    const words = (a.id + ' ' + a.label).toLowerCase();
    if (a.type === 'carousel') return 'carousel';
    if (a.type === 'video') return a.role === 'assembly' || /spoken|speech|available-cut/.test(words) ? 'spoken' : 'edit';
    if (a.type === 'board') return p.format === 'presentation' ? 'slides' : /storyboard/.test(words) ? 'storyboard' : 'studies';
    return /visual.plan|direction|storyboard/.test(words) ? 'storyboard' : 'notes';
  }
  const labels = {spoken: 'Spoken cut', storyboard: 'Storyboard', edit: 'Edit', carousel: 'Carousel', slides: 'Slides & layouts', studies: 'Design studies', notes: 'Project notes'};
  function versions(p, name) {
    return p.artifacts.filter(a => stage(p, a) === name).sort((a, b) => {
      if (a.id === p.primary_artifact) return -1;
      if (b.id === p.primary_artifact) return 1;
      const number = a => Number((String(a.version || '').match(/V(\d+)/i) || [])[1] || 0);
      return number(b) - number(a);
    });
  }
  function badge(p, a) {
    if(p.stale)return 'Saved version · notes updated';
    const tags = [];
    if(a.id!==p.primary_artifact&&versions(p,stage(p,a))[0]?.id===a.id)tags.push('Latest saved');
    if (a.id === p.primary_artifact) tags.push('Latest');
    if (a.role === 'final') tags.push('Final');
    else if (a.role === 'approved') tags.push('Approved');
    else if (a.role === 'baseline') tags.push('Accepted');
    return tags.join(' · ') || (a.role === 'history' ? 'Earlier version' : 'Saved version');
  }
  function navigation(p, a) {
    const name = stage(p, a), rows = versions(p, name);
    return `<div class="review-navigation"><div class="stage-tabs" role="group" aria-label="Project stages">${Object.entries(labels).filter(([key]) => p.artifacts.some(v => stage(p, v) === key)).map(([key, label]) => `<button data-stage="${h(key)}" aria-pressed="${key === name}">${label}</button>`).join('')}</div>
      <details class="version-picker"><summary>${h(a.version || a.label)} <span>${h(badge(p, a))}</span> <span aria-hidden="true">⌄</span></summary><div class="version-list" role="group" aria-label="${h(labels[name] || name)} versions">${rows.map(v => `<button data-artifact="${h(v.id)}" aria-label="View ${h(v.label)} ${h(v.version || '')}" aria-pressed="${v.id === a.id}"><span><strong>${h(v.version || v.label)}</strong><small>${h(badge(p, v))}</small></span><b>${h(v.label)}</b><span class="version-description">${h(v.description || '')}</span></button>`).join('')}</div></details></div>`;
  }
  function download(d) {
    return d.available ? `<a href="${h(d.url)}" download="${h(d.path.split('/').pop())}">${h(d.label)} ↓</a>` : `<span class="unavailable">${h(d.label)} · unavailable</span>`;
  }
  function downloads(a) {
    const files = [...(a.downloads || [])];
    if (a.type === 'video' && a.available) files.unshift({...a, label: 'Download video'});
    const primary = files.filter(d => /^(download video|captions|download all|all slides|powerpoint|slide deck|final assets|carousel.*zip)/i.test(d.label));
    const extra = files.filter(d => !primary.includes(d));
    return `<div class="review-downloads">${primary.map(download).join('')}${extra.length ? `<details class="more-downloads"><summary>More downloads</summary><div>${extra.map(download).join('')}</div></details>` : ''}</div>`;
  }
  function details(p) {
    return `<details class="project-details"><summary>Project details <span>Brief, direction & decisions</span></summary><div class="project-details-body"><div class="project-detail-summary"><section><h3>About this project</h3><p>${h(p.summary || p.input_note || '')}</p></section>${p.baseline ? `<section><h3>Accepted direction</h3><p>${h(p.baseline)}</p></section>` : ''}<section><h3>Next step</h3><p>${h(p.next_step || '')}</p></section></div><div class="note-choices">${p.source_notes.map((n, i) => `<button class="secondary" data-project-note="${i}" ${n.available ? '' : 'disabled'}>${h(n.label)}</button>`).join('')}</div><article id="readable-project-note" class="readable-note" hidden></article><details class="original-notes"><summary>Original working files</summary><div>${p.source_notes.map(n => n.available ? `<a href="${h(n.url)}" target="_blank" rel="noopener">${h(n.label)}</a>` : `<span>${h(n.label)} · unavailable</span>`).join('')}</div></details>${p.reference_id && entries.some(e => e.id === p.reference_id) ? `<a class="plain-link" href="#style=${encodeURIComponent(p.reference_id)}">View in Reference Library</a>` : ''}</div></details>`;
  }
  function readable(text) {
    let code = false;
    return text.split('\n').map(line => {
      if (line.startsWith('```')) { code = !code; return ''; }
      if (code) return `<pre>${h(line)}</pre>`;
      if (!line.trim() || /^<!--/.test(line)) return '';
      const heading = line.match(/^#{1,6}\s+(.+)/);
      if (heading) return `<h4>${h(heading[1])}</h4>`;
      return `<p>${h(line.replace(/^[-*]\s+/, '• ').replace(/\*\*([^*]+)\*\*/g, '$1'))}</p>`;
    }).join('');
  }
  function heading(p, a) {
    return `<div class="artifact-heading"><div><p class="eyebrow">${h(badge(p, a))}</p><h3>${h(a.label)}${a.version ? ' · ' + h(a.version) : ''}</h3></div>${downloads(a)}</div>`;
  }
  function content(p, a, frameIndex) {
    const title = heading(p, a);
    const earlier = a.id !== p.primary_artifact ? `<div class="viewing-saved"><span>You’re viewing ${h(a.version || a.label)}. ${h(badge(p, a))}.</span><button class="text-button" data-back-current>Back to latest</button>${a.type === 'video' ? '<button class="text-button" data-use-version>Use as a starting point</button>' : ''}</div>` : '';
    if (!a.available) return title + earlier + '<p class="project-notice">This saved file is unavailable. Ask your assistant to relink this exact version.</p>';
    let media;
    if (a.type === 'video') {
      media = `<div class="artifact-stage video-stage"><video controls muted playsinline preload="metadata" ${a.id === p.primary_artifact && p.cover ? `poster="${h(p.cover)}"` : ''} src="${h(a.url)}" aria-label="${h(p.title + ' ' + a.label + ' ' + (a.version || ''))}"></video></div>`;
    } else if (a.frames) {
      const f = a.frames[frameIndex];
      media = `<div><div class="artifact-stage frame-stage ${p.format === 'presentation' ? 'landscape-stage' : ''}">${!f.available ? '<p>This scene is unavailable.</p>' : f.media_type === 'video' ? `<video controls muted playsinline preload="metadata" src="${h(f.url)}" aria-label="${h(f.title)}"></video>` : `<button class="enlarge-frame" data-enlarge-frame aria-label="Enlarge ${h(f.title)}"><img src="${h(f.url)}" alt="${h(f.title)}"><span>Enlarge ↗</span></button>`}</div><div class="frame-navigation"><button data-frame-step="-1" aria-label="Previous scene" ${frameIndex === 0 ? 'disabled' : ''}>←</button><span>${frameIndex + 1} / ${a.frames.length} · ${a.type === 'carousel' ? 'Slide' : 'Scene'}</span><button data-frame-step="1" aria-label="Next scene" ${frameIndex === a.frames.length - 1 ? 'disabled' : ''}>→</button></div></div>`;
    } else media = '<article class="readable-note project-document">Loading the saved notes…</article>';
    const f = a.frames?.[frameIndex];
    const notes = f ? `<p class="frame-timing">${h(f.timing || '')}</p><h4 class="frame-title">${h(f.title)}</h4>${f.speech ? `<div class="frame-note"><h5>Spoken line</h5><p>${h(f.speech)}</p></div>` : ''}${f.copy ? `<div class="frame-note"><h5>On screen</h5><p>${h(f.copy)}</p></div>` : ''}<details class="scene-details"><summary>Movement & sound</summary>${[['Movement', f.motion], ['Sound', f.sound]].filter(([, v]) => v).map(([label, value]) => `<div class="frame-note"><h5>${label}</h5><p>${h(value)}</p></div>`).join('')}<p>${h(a.description || '')}</p>${f.available ? `<a href="${h(f.url)}" download="${h(f.path.split('/').pop())}">Download this ${a.type === 'carousel' ? 'slide' : 'frame'} ↓</a>` : ''}</details>` : `<h4 class="what-changed">${a.id === p.primary_artifact ? 'What’s ready to review' : 'About this version'}</h4><p class="artifact-description">${h(a.description || '')}</p>`;
    const thumbs = a.frames ? `<div class="storyboard-toolbar"><button class="text-button" data-overview>See all ${a.frames.length} ${a.type === 'carousel' ? 'slides' : 'scenes'}</button></div><div class="project-thumbs" aria-label="Choose a scene">${a.frames.map((f, i) => `<button data-project-frame="${i}" aria-label="Scene ${i + 1}: ${h(f.title)}" aria-pressed="${i === frameIndex}">${f.available && f.media_type !== 'video' ? `<img src="${h(f.url)}" alt="" loading="lazy">` : '<span class="thumb-video">▶</span>'}<span>${String(i + 1).padStart(2, '0')}</span><small>${h(f.title)}</small></button>`).join('')}</div>` : '';
    return title + earlier + `<div class="artifact-layout ${p.format === 'presentation' ? 'landscape-artifact' : ''}">${media}<div class="artifact-notes">${notes}<div id="review-controls"></div><section id="feedback-panel"></section></div></div>${thumbs}`;
  }
  document.addEventListener('click', event => {
    document.querySelectorAll('.version-picker[open]').forEach(menu => {if(!menu.contains(event.target))menu.open=false;});
  });
  document.addEventListener('keydown', event => {
    if(event.key!=='Escape')return;
    const menu=document.querySelector('.version-picker[open]');
    if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();event.stopPropagation();}
  });
  return {stage, labels, versions, navigation, details, heading, content, readable};
})();
