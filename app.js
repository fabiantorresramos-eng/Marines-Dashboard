/* Marine Proficiency Dashboard (Agony-theme)
   - Grouping: PLT > Squad > Team (from staff.xlsx CSV export)
   - Profiles: "baseball cards"
   - Per card: 4 radar graphs (0621/0629, 0627/0629, 0631/0639, 0671/0679)
   - Each radar point is clickable to open amplified info (score + notes/evidence)
   - Data source: built-in demo roster OR user-uploaded CSV (Load CSV)
*/

(function(){
  const DEFAULT_ROSTER_URL = null;
  const AREA_KEYS = ['planning','setup','ops','trouble','security'];
  const AREA_LABELS = {
    planning: 'Planning & Preparation',
    setup: 'System Setup & Configuration',
    ops: 'Operations & Employment',
    trouble: 'Troubleshooting & Maintenance',
    security: 'Security, Safety & Leadership'
  };

  const RUBRIC_KEYS = ['0621-0629','0627-0629','0631-0639','0671-0679'];
  const RUBRIC_LABELS = {
    '0621-0629': 'Radio (0621/0629)',
    '0627-0629': 'SATCOM (0627/0629)',
    '0631-0639': 'Network (0631/0639)',
    '0671-0679': 'Data (0671/0679)'
  };

  // =========================================================
  // ✅ FIX: Profile images live in REPO ROOT (NOT assets/mos/)
  // =========================================================
  // Your repo shows files like: 0621.png, 0627.png, 1stsgt.png in the ROOT
  const MOS_IMAGE_MAP = {
    '0602': '0602.png',
    '0621': '0621.png',
    '0627': '0627.png',
    '0631': '0631.png',
    '0671': '0671.png',
    '0699': '0699.png'
  };

  function getProfileImageUrl(m){
    const mosRaw = (m?.mos ?? m?.MOS ?? '').toString().trim();
    const mos = (mosRaw.match(/\d{4}/)?.[0]) || '';

    const billetRaw = (m?.billet ?? m?.Billet ?? m?.title ?? m?.Title ?? '').toString().trim();
    const billet = billetRaw.toLowerCase();

    // Optional leadership art in ROOT (only if you upload it)
    // You DO have 1stsgt.png in root based on your screenshot.
    if (billet.includes('first sergeant') || billet.includes('1stsgt') || billet.includes('1st sgt')) {
      return './1stsgt.png';
    }
    // If you later add this file to root, it will work automatically:
    if (billet.includes('company commander')) {
      return './company_commander.png';
    }

    if (mos && MOS_IMAGE_MAP[mos]) return `./${MOS_IMAGE_MAP[mos]}`;
    return null;
  }

  // Avatar helper: supports MOS-based profile photos + safe fallback initials.
  function setAvatar(el, marine, fallbackText){
    const url = getProfileImageUrl(marine);
    const fallback = (fallbackText || '').trim();

    if(url){
      el.classList.add('has-img');
      el.innerHTML = `<img src="${url}" alt="Profile" loading="lazy">`;

      // ✅ If image path is wrong / missing, fall back to initials instead of blank box.
      const img = el.querySelector('img');
      img.onerror = () => {
        el.classList.remove('has-img');
        el.textContent = fallback;
      };
    } else {
      el.classList.remove('has-img');
      el.textContent = fallback;
    }
  }

  // Back-compat alias used in some modal builders (older versions called this `setAvatarEl`).
  const setAvatarEl = setAvatar;

  const PREFIX_BY_RUBRIC = {
    '0621-0629': ['R0621','0621','RADIO','0621/0629','0621-0629'],
    '0627-0629': ['R0627','0627','SATCOM','0627/0629','0627-0629'],
    '0631-0639': ['R0631','0631','NETWORK','0631/0639','0631-0639'],
    '0671-0679': ['R0671','0671','DATA','0671/0679','0671-0679']
  };

  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function avg(arr){ return arr.length ? (arr.reduce((s,x)=>s+x,0)/arr.length) : 0; }

  // ---- Grouping (PLT -> Squad -> Team) ----
  function groupRoster(roster){
    const root = new Map();
    for(const m of roster){
      const plt = m.plt || 'HQ';
      const squad = m.squad || 'Unassigned';
      const team = (m.team && String(m.team).trim()) ? m.team : (m.squad && String(m.squad).trim() ? 'No Team' : 'Unassigned');
      if(!root.has(plt)) root.set(plt, new Map());
      const sMap = root.get(plt);
      if(!sMap.has(squad)) sMap.set(squad, new Map());
      const tMap = sMap.get(squad);
      if(!tMap.has(team)) tMap.set(team, []);
      tMap.get(team).push(m);
    }

    const pltOrder = (k)=>{
      const s = String(k).toLowerCase();
      if(s.includes('1st')) return 1;
      if(s.includes('2nd')) return 2;
      if(s.includes('3rd')) return 3;
      if(s.includes('hq')) return 99;
      return 50;
    };
    const sorted = [...root.entries()].sort((a,b)=>pltOrder(a[0]) - pltOrder(b[0]) || a[0].localeCompare(b[0]));

    for(const [, sMap] of sorted){
      for(const [, tMap] of sMap){
        for(const [, arr] of tMap){
          arr.sort((x,y)=>`${x.lastName} ${x.firstName}`.localeCompare(`${y.lastName} ${y.firstName}`));
        }
      }
    }
    return sorted;
  }

  // ---- Hierarchy view helpers ----
  function overallForMarine(m){
    const rubrics = (m.rubrics||[]);
    if(!rubrics.length) return 0;
    const per = RUBRIC_KEYS.map(rid=>{
      const r = rubrics.find(x=>x.id===rid);
      if(!r) return null;
      const vals = AREA_KEYS.map(k=>{
        const a = (r.areas||[]).find(x=>x.key===k);
        return clamp(a?.score ?? 0, 0, 100);
      });
      return Math.round(avg(vals));
    }).filter(v=>v!==null);

    if(!per.length){
      const r = rubrics[0];
      const vals = AREA_KEYS.map(k=>{
        const a = (r.areas||[]).find(x=>x.key===k);
        return clamp(a?.score ?? 0, 0, 100);
      });
      return Math.round(avg(vals));
    }
    return Math.round(avg(per));
  }

  function summarizeGroup(marines){
    const count = marines.length;
    const scored = count;
    const overall = count ? Math.round(avg(marines.map(overallForMarine))) : 0;
    return { count, scored, overall };
  }

  function teamPanelData(ctx, members){
    const count = members.length;
    const avgScore = count ? Math.round(avg(members.map(overallForMarine))) : 0;

    const sorted = members.slice().sort((a,b)=> overallForMarine(b) - overallForMarine(a) || nameKey(a).localeCompare(nameKey(b)));
    const top3 = sorted.slice(0,3).map(m=>({
      name: `${m.rank||''} ${m.firstName||''} ${m.lastName||''}`.trim(),
      mos: m.mos||'—',
      score: overallForMarine(m)
    }));
    const bottom3 = sorted.slice(-3).reverse().map(m=>({
      name: `${m.rank||''} ${m.firstName||''} ${m.lastName||''}`.trim(),
      mos: m.mos||'—',
      score: overallForMarine(m)
    }));

    return {
      title: String(ctx.team||'Team'),
      subtitle: `${ctx.plt||'HQ'} · ${ctx.squad||'Unassigned'}`,
      basis: 'All specialties (avg of 4 rubrics)',
      avg: avgScore,
      scored: `${count}/${count}`,
      topArea: '—',
      lowArea: '—',
      note: 'Area breakdown is available when a single specialty is selected.',
      top3,
      bottom3
    };
  }

  // ---- Radar SVG with clickable points ----
  function radarSVG(rubric, ctx){
    const size = ctx.size ?? 92;
    const pad = 10;
    const cx = size/2, cy = size/2;
    const r = (size/2) - pad;
    const uid = `rg_${sanitizeId(ctx.marineId)}_${sanitizeId(ctx.rubricId)}`;

    const scores = AREA_KEYS.map(k=>{
      const a = (rubric.areas || []).find(x=>x.key===k);
      return clamp(a?.score ?? 0, 0, 100);
    });

    const pts = [];
    for(let i=0;i<5;i++){
      const ang = (-Math.PI/2) + (i * 2*Math.PI / 5);
      const v = scores[i] / 100;
      const x = cx + Math.cos(ang) * r * v;
      const y = cy + Math.sin(ang) * r * v;
      pts.push({x,y, key: AREA_KEYS[i], label: AREA_LABELS[AREA_KEYS[i]], score: scores[i]});
    }

    const poly = pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const rings = [0.25,0.5,0.75,1].map((t)=>{
      const ringPts=[];
      for(let i=0;i<5;i++){
        const ang = (-Math.PI/2) + (i * 2*Math.PI / 5);
        ringPts.push([
          cx + Math.cos(ang) * r * t,
          cy + Math.sin(ang) * r * t
        ]);
      }
      return ringPts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    });

    const spokes = [];
    for(let i=0;i<5;i++){
      const ang = (-Math.PI/2) + (i * 2*Math.PI / 5);
      spokes.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r
      });
    }

    return `
      <svg class="radar" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Radar chart">
        <defs>
          <linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(200,155,75,.95)"/>
            <stop offset="1" stop-color="rgba(255,75,110,.9)"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="rgba(246,243,243,.10)" stroke-width="1">
          ${rings.map(rp=>`<polygon points="${rp}"/>`).join('')}
          ${spokes.map(s=>`<line x1="${cx}" y1="${cy}" x2="${s.x.toFixed(1)}" y2="${s.y.toFixed(1)}"/>`).join('')}
        </g>
        <polygon points="${poly}" fill="url(#${uid})" opacity=".18"/>
        <polygon points="${poly}" stroke="url(#${uid})" stroke-width="2" fill="none"/>
        ${pts.map(p=>{
          const attrs = `data-mid="${escapeXml(ctx.marineId)}" data-rid="${escapeXml(ctx.rubricId)}" data-ak="${escapeXml(p.key)}" data-score="${p.score}"`;
          return `
            <circle class="radar-hit radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" ${attrs} />
            <circle class="radar-dot radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" ${attrs} />
          `;
        }).join('')}
      </svg>
    `;
  }

  function bigRadarSVG(rubric, ctx){
    const size = 380;
    const pad = 44;
    const cx = size/2, cy = size/2;
    const r = (size/2) - pad;
    const uid = `rgBig_${sanitizeId(ctx.marineId)}_${sanitizeId(ctx.rubricId)}`;

    const scores = AREA_KEYS.map(k=>{
      const a = (rubric.areas || []).find(x=>x.key===k);
      return clamp(a?.score ?? 0, 0, 100);
    });

    const pts=[];
    const axis=[];
    for(let i=0;i<5;i++){
      const ang = (-Math.PI/2) + (i * 2*Math.PI / 5);
      const v = scores[i] / 100;
      pts.push({
        x: cx + Math.cos(ang) * r * v,
        y: cy + Math.sin(ang) * r * v,
        ax: cx + Math.cos(ang) * r,
        ay: cy + Math.sin(ang) * r,
        key: AREA_KEYS[i],
        label: AREA_LABELS[AREA_KEYS[i]],
        score: scores[i]
      });
      axis.push({x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r});
    }

    const poly = pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const rings=[0.2,0.4,0.6,0.8,1].map((t)=>{
      const ringPts=[];
      for(let i=0;i<5;i++){
        const ang = (-Math.PI/2) + (i * 2*Math.PI / 5);
        ringPts.push([
          cx + Math.cos(ang) * r * t,
          cy + Math.sin(ang) * r * t
        ]);
      }
      return ringPts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    });

    const labelEls = pts.map((p)=>{
      const dx = p.ax - cx;
      const dy = p.ay - cy;
      const lx = cx + dx*1.18;
      const ly = cy + dy*1.18;
      const anchor = Math.abs(dx) < 8 ? 'middle' : (dx>0 ? 'start' : 'end');
      const lab = shortLabel(p.label);
      return `<text class="radar-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" fill="rgba(246,243,243,.88)">${escapeXml(lab)}</text>`;
    }).join('');

    const vbMargin = 84;
    return `
      <svg class="big-radar" viewBox="-${vbMargin} -${vbMargin} ${size+(vbMargin*2)} ${size+(vbMargin*2)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Radar chart">
        <defs>
          <linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(200,155,75,.95)"/>
            <stop offset="1" stop-color="rgba(255,75,110,.90)"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="rgba(246,243,243,.11)" stroke-width="1">
          ${rings.map(rp=>`<polygon points="${rp}"/>`).join('')}
          ${axis.map(s=>`<line x1="${cx}" y1="${cy}" x2="${s.x.toFixed(1)}" y2="${s.y.toFixed(1)}"/>`).join('')}
        </g>
        <polygon points="${poly}" fill="url(#${uid})" opacity=".18"/>
        <polygon points="${poly}" stroke="url(#${uid})" stroke-width="3" fill="none"/>
        ${pts.map(p=>{
          const attrs = `data-mid="${escapeXml(ctx.marineId)}" data-rid="${escapeXml(ctx.rubricId)}" data-ak="${escapeXml(p.key)}" data-score="${p.score}"`;
          return `
            <circle class="radar-hit radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" ${attrs} />
            <circle class="radar-dot radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" ${attrs} />
          `;
        }).join('')}
        ${labelEls}
      </svg>
    `;
  }

  function shortLabel(full){
    return String(full)
      .replace('System Setup & Configuration','Setup & Config')
      .replace('Operations & Employment','Ops & Employ')
      .replace('Troubleshooting & Maintenance','Troubleshoot')
      .replace('Security, Safety & Leadership','Security');
  }

  function sanitizeId(s){
    return String(s||'').replace(/[^a-zA-Z0-9_\-]/g,'_');
  }

  // ---- Scoring helpers ----
  function rubricOverall(r){
    return Math.round(avg((r.areas||[]).map(a=>clamp(a.score||0,0,100))));
  }
  function calcMarineOverall(m){
    const rubrics = (m.rubrics || []).slice(0,4);
    return rubrics.length ? Math.round(avg(rubrics.map(r=>rubricOverall(r)))) : 0;
  }

  // ---- HTML helpers ----
  function escapeXml(s){
    return String(s??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function pickNonEmpty(...vals){
    for(const v of vals){
      if(v === 0) return '0';
      if(v === false) continue;
      const s = String(v ?? '').trim();
      if(s) return s;
    }
    return '';
  }

  function isTruthy(v){
    const s = String(v ?? '').trim().toLowerCase();
    return ['y','yes','true','1','t','committed','deploy','deployed'].includes(s);
  }

  function statusClass(status){
    const s = String(status || '').toLowerCase();
    if(!s) return 's-unknown';
    if(s.includes('tad') || s.includes('leave') || s.includes('limdu') || s.includes('med')) return 's-warn';
    if(s.includes('eas') || s.includes('pcs') || s.includes('sep') || s.includes('terminal')) return 's-warn';
    if(s.includes('active') || s.includes('avail') || s.includes('present')) return 's-ok';
    return 's-ok';
  }

  function renderHeaderMeta({status, operation}){
    const s = String(status || '').trim();
    const op = String(operation || '').trim();
    const opLabel = op ? op : 'Not committed';
    const opClass = op ? 'op-on' : 'op-off';
    const statusLabel = s ? s : 'Unknown';
    return `
      <span class="meta-badge ${statusClass(statusLabel)}"><span class="dot"></span> Status: ${escapeXml(statusLabel)}</span>
      <span class="meta-badge ${opClass}"><span class="dot"></span> Op: ${escapeXml(opLabel)}</span>
    `;
  }

  // ---- Cards + groups ----
  function cardHTML(m){
    const name = `${m.lastName || ''}, ${m.firstName || ''}`.trim();
    const initials = `${(m.firstName||'')[0]||''}${(m.lastName||'')[0]||''}`.toUpperCase();
    const overall = calcMarineOverall(m);

    const imgUrl = getProfileImageUrl({
      mos: m.mos,
      MOS: m.mos,
      billet: m.billet,
      Billet: m.billet,
      name: name || `${m.rank||''} ${m.lastName||''}`.trim()
    });

    const avatarInner = imgUrl
      ? `<img src="${escapeXml(imgUrl)}" alt="Profile artwork" loading="lazy" onerror="this.remove(); this.parentElement.classList.remove('has-img'); this.parentElement.textContent='${escapeXml(initials||'US')}'">`
      : escapeXml(initials || 'US');

    const status = String(m.status || '').toUpperCase();
    const statusBadge = status ? `<span class="badge ${status.includes('TAD')||status.includes('LEAVE')||status.includes('MED')?'warn':'ok'}">${escapeXml(status)}</span>` : '';

    const mos = m.mos ? `<span class="badge">MOS ${escapeXml(String(m.mos))}</span>` : '';
    const billet = m.billet ? `<span class="badge">${escapeXml(String(m.billet))}</span>` : '';

    const rubrics = (m.rubrics || []).slice(0,4);

    const radarItems = RUBRIC_KEYS.map((rid)=>{
      const r = rubrics.find(x=>x.id===rid) || makeEmptyRubric(rid);
      const pct = rubricOverall(r);
      return `
        <div class="radar-item">
          <div class="radar-label">
            <span class="code">${escapeXml(rid)}</span>
            <span class="pct">${pct}%</span>
          </div>
          ${radarSVG(r, {marineId: m.id, rubricId: rid, size: 92})}
        </div>
      `;
    }).join('');

    return `
      <article class="card" data-id="${escapeXml(m.id)}">
        <div class="card-top">
          <div class="avatar${imgUrl ? ' has-img' : ''}">${avatarInner}</div>
          <div class="card-id">
            <div class="card-name">
              <span class="rank">${escapeXml(m.rank || 'Rank')}</span>
              <span class="name">${escapeXml(name || 'Unknown')}</span>
            </div>
            <div class="card-sub">
              ${statusBadge}
              ${mos}
              ${billet}
            </div>
          </div>
        </div>

        <div class="card-mid">
          <div class="kpi">
            <div class="label">Overall proficiency</div>
            <div class="value">${overall}<small>%</small></div>
            <div class="mini">Click a radar point to see details.</div>
          </div>
          <div class="radar-grid">${radarItems}</div>
        </div>
      </article>
    `;
  }

  // ---- Hierarchy layout helpers ----
  function withinNav(m, nav){
    if(nav.plt && String(m.plt||'').trim() !== String(nav.plt).trim()) return false;
    if(nav.squad && String(m.squad||'').trim() !== String(nav.squad).trim()) return false;
    if(nav.team && String(m.team||'').trim() !== String(nav.team).trim()) return false;
    return true;
  }

  function crumbsHTML(nav){
    const parts = [];
    parts.push(`<button class="crumb" type="button" data-nav="root">All</button>`);
    if(nav.plt) parts.push(`<span class="sep">›</span><button class="crumb" type="button" data-nav="plt">${escapeXml(nav.plt)}</button>`);
    if(nav.squad) parts.push(`<span class="sep">›</span><button class="crumb" type="button" data-nav="squad">Squad ${escapeXml(nav.squad)}</button>`);
    if(nav.team) parts.push(`<span class="sep">›</span><button class="crumb" type="button" data-nav="team">Team ${escapeXml(nav.team)}</button>`);
    return parts.join('');
  }

  function tileHTML(kind, label, meta){
    const { count, overall } = meta;
    return `
      <button class="tile" type="button" data-kind="${escapeXml(kind)}" data-value="${escapeXml(label)}">
        <div class="tile-head">
          <div class="tile-left">
            <div class="tile-label">${escapeXml(label)}</div>
            <div class="tile-kind">${escapeXml(kind.toUpperCase())}</div>
          </div>
          <div class="tile-count">${count}</div>
        </div>
        <div class="tile-sub">${count} Marine${count===1?'':'s'} · Avg ${overall}%</div>
        <div class="tile-bar" aria-hidden="true"><i style="width:${clamp(overall,0,100)}%"></i></div>
      </button>
    `;
  }

  // ---- Org chart layout helpers ----
  function pltDisplayLabel(plt){
    const s = String(plt||'').trim();
    if(!s) return 'HQ';
    const low = s.toLowerCase();
    if(low === 'hq' || low.includes('headquarters')) return 'HQ';
    return s;
  }

  function mosCategory(mos){
    const s = String(mos||'').trim();
    if(!s) return 'neutral';
    const digits = (s.match(/\d{4}/) || [])[0] || s;
    if(digits.startsWith('0621')) return 'radio';
    if(digits.startsWith('0627')) return 'trans';
    if(digits.startsWith('0629')) return 'trans';
    if(digits.startsWith('0671') || digits.startsWith('0679')) return 'data';
    if(digits.startsWith('0631') || digits.startsWith('0639')) return 'network';
    return 'neutral';
  }

  function nodeHTML(m, opts={}){
    const cat = mosCategory(m.mos);
    const cls = `node node-${cat}` + (opts.compact ? ' compact' : '') + (opts.role ? ' role' : '');
    const name = `${m.rank||''} ${m.firstName||''} ${m.lastName||''}`.trim() || 'Marine';
    const billet = (m.billet||'').toString().trim();
    const sub = opts.subLabel || billet || (m.mos ? `MOS ${m.mos}` : '');
    return `
      <button class="${cls}" type="button" data-mid="${escapeXml(m.id)}" title="Click to open profile">
        <div class="node-name">${escapeXml(name)}</div>
        ${sub ? `<div class="node-sub">${escapeXml(sub)}</div>` : ``}
      </button>
    `;
  }

  function squadOrder(k){
    const s = String(k||'').toLowerCase();
    if(s.includes('1')) return 1;
    if(s.includes('2')) return 2;
    if(s.includes('3')) return 3;
    return 50;
  }

  function teamOrder(k){
    const s = String(k||'').toLowerCase();
    if(s.includes('team') && s.match(/\b1\b/)) return 1;
    if(s.includes('team') && s.match(/\b2\b/)) return 2;
    if(s.includes('no team')) return 98;
    if(s.includes('unassigned')) return 99;
    return 50;
  }

  function nameKey(m){
    return `${m.lastName||''} ${m.firstName||''}`.trim().toLowerCase();
  }

  function renderHQ(container, marines, plt){
    container.innerHTML = `
      <div class="view-head">
        <div class="view-title">${escapeXml(plt)} · HQ Roster</div>
        <div class="view-sub">All HQ Marines grouped together (for now). Click a name for details.</div>
      </div>
      <div class="org-wrap">
        <div class="org-legend">
          <div class="org-legend-title">Legend</div>
          <div class="org-legend-items">
            <span class="lg radio">Radio</span>
            <span class="lg trans">Transmissions</span>
            <span class="lg data">Data</span>
            <span class="lg network">Network</span>
          </div>
        </div>
        <div class="org-list">
          ${marines.map(m=>nodeHTML(m,{compact:true})).join('')}
        </div>
      </div>
    `;
  }

  function renderPltOrgChart(container, marines, plt){
    const pltLabel = pltDisplayLabel(plt);
    if(String(pltLabel).toLowerCase().includes('hq')){
      renderHQ(container, marines, pltLabel);
      return;
    }

    const staff = marines.filter(m=> String(m.squad||'').trim().toLowerCase()==='platoon staff');
    const line = marines.filter(m=> !staff.some(s=>String(s.id)===String(m.id)) );

    const bySquad = new Map();
    for(const m of line){
      const squad = m.squad || 'Unassigned';
      const team = (m.team && String(m.team).trim()) ? m.team : 'No Team';
      if(!bySquad.has(squad)) bySquad.set(squad, new Map());
      const tMap = bySquad.get(squad);
      if(!tMap.has(team)) tMap.set(team, []);
      tMap.get(team).push(m);
    }

    const squadCols = [...bySquad.entries()]
      .sort((a,b)=>squadOrder(a[0]) - squadOrder(b[0]) || String(a[0]).localeCompare(String(b[0])))
      .map(([squad, tMap])=>{
        const teamCols = [...tMap.entries()]
          .sort((a,b)=>teamOrder(a[0]) - teamOrder(b[0]) || String(a[0]).localeCompare(String(b[0])))
          .map(([team, members])=>{
            const sorted = members.slice().sort((a,b)=> nameKey(a).localeCompare(nameKey(b)));
            const items = sorted.map(m=>nodeHTML(m,{compact:true})).join('');
            const pd = teamPanelData({plt: pltLabel, squad: squad, team: team}, sorted);
            const pdJson = escapeXml(JSON.stringify(pd));
            return `
              <div class="org-team">
                <div class="org-team-title">${escapeXml(team)} <button class="org-team-meta-btn team-panel-trigger" data-panel="${pdJson}">${sorted.length} · Avg ${pd.avg}%</button></div>
                <div class="org-team-list">${items || `<div class="small">—</div>`}</div>
              </div>
            `;
          }).join('');

        return `
          <div class="org-squad">
            <div class="org-squad-head">
              <div>
                <div class="org-squad-title">${escapeXml(squad)}</div>
                <div class="org-squad-sub">${tMap.size} Team${tMap.size===1?'':'s'}</div>
              </div>
            </div>
            <div class="org-team-grid">${teamCols}</div>
          </div>
        `;
      }).join('');

    container.innerHTML = `
      <div class="view-head">
        <div class="view-title">${escapeXml(pltLabel)} · Platoon Breakdown</div>
        <div class="view-sub">Click any Marine name to open the baseball card profile.</div>
      </div>

      <div class="org-wrap">
        <div class="org-legend">
          <div class="org-legend-title">Legend</div>
          <div class="org-legend-items">
            <span class="lg radio">Radio</span>
            <span class="lg trans">Transmissions</span>
            <span class="lg data">Data</span>
            <span class="lg network">Network</span>
          </div>
        </div>

        ${staff.length ? `
          <div class="org-staff">
            <div class="org-staff-title">Platoon Staff</div>
            <div class="org-list">${staff.slice().sort((a,b)=>nameKey(a).localeCompare(nameKey(b))).map(m=>nodeHTML(m,{compact:true})).join('')}</div>
          </div>
        ` : ''}

        <div class="org-squad-grid">
          ${squadCols || `<div class="small">No squad/team data found for this PLT.</div>`}
        </div>
      </div>
    `;
  }

  function renderHierarchy(container, roster, nav, crumbsEl){
    const scoped = roster.filter(m=>withinNav(m, nav));
    if(crumbsEl) crumbsEl.innerHTML = crumbsHTML(nav);

    if(!nav.plt){
      const by = new Map();
      for(const m of scoped){
        const k = m.plt || 'HQ';
        if(!by.has(k)) by.set(k, []);
        by.get(k).push(m);
      }
      const order = (k)=>{
        const s = String(k).toLowerCase();
        if(s.includes('1st')) return 1;
        if(s.includes('2nd')) return 2;
        if(s.includes('3rd')) return 3;
        if(s.includes('hq')) return 99;
        return 50;
      };
      const tiles = [...by.entries()]
        .sort((a,b)=>order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
        .map(([plt, arr])=>tileHTML('plt', plt, summarizeGroup(arr)))
        .join('');
      container.innerHTML = `
        <div class="view-head">
          <div class="view-title">Select a PLT</div>
          <div class="view-sub">Org layout: click a Marine name to open the baseball card profile.</div>
        </div>
        <div class="tile-grid">${tiles || `<div class="small">No results.</div>`}</div>
      `;
      return { count: by.size, marines: scoped.length };
    }

    const pltScoped = roster.filter(m=>String(m.plt||'HQ').trim()===String(nav.plt).trim());
    renderPltOrgChart(container, pltScoped, nav.plt);
    return { count: pltScoped.length, marines: pltScoped.length };
  }

  // ---- Modals ----
  function buildProfileModal(){
    const el = document.createElement('div');
    el.className = 'md-modal';
    el.innerHTML = `
      <div class="md-dialog hud-shell" role="dialog" aria-modal="true" aria-label="Marine profile">
        <header>
          <div class="left">
            <div class="title">
              <b id="mdName">Marine</b>
              <span id="mdSub">PLT · Squad · Team</span>
            </div>
          </div>
          <button class="btn" id="mdClose">Close</button>
        </header>
        <div class="md-body md-body-v2">
          <div class="panel hud-module md-left">
            <div class="profile-side">
              <div class="profile-photo" id="mdAvatar">US</div>
              <div class="profile-info">
                <div class="meta-chips" id="mdChips"></div>
                <div class="tabs profile-tabs" id="mdProfileTabs"></div>
                <div class="profile-tabcontent" id="mdProfileContent"></div>
              </div>
            </div>
          </div>

          <div class="panel hud-module md-right">
            <div class="module-header">
              <h5 class="hud-title">Rubric Radar</h5>
              <span class="hud-label">5 Core Areas</span>
            </div>
            <div id="mdRadar"></div>
            <div class="tabs tabs-under" id="mdTabs"></div>
            <div class="footnote">Tip: change the Specialty filter to see the radar update.</div>
          </div>

          <div class="panel hud-module md-bottom">
            <div class="module-header">
              <h5 class="hud-title">Area Scores</h5>
              <span class="hud-label">Avg % by Area</span>
            </div>
            <div class="area-list" id="mdAreas"></div>
            <div class="footnote">
              Tip: click any radar point to open the expanded area detail.
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const close = ()=>el.classList.remove('show');
    $('#mdClose', el).addEventListener('click', close);
    el.addEventListener('click', (e)=>{ if(e.target === el) close(); });

    return {
      el,
      open: (marine, openRubricId)=>{
        const name = `${marine.rank||''} ${marine.firstName||''} ${marine.lastName||''}`.trim() || 'Marine';
        $('#mdName', el).textContent = name;
        $('#mdSub', el).textContent = `${marine.plt||'HQ'} · Squad ${marine.squad||'Unassigned'} · Team ${marine.team||'Unassigned'} · MOS ${marine.mos||'—'}`;

        const raw = marine.raw || {};
        const rf = (names)=>getField(raw, names);

        const statusVal = marine.status || rf(['Status','Marine Status','STATUS']);
        const opVal = marine.operation || rf([
          'Current Operation','Current Operation  ','Operation','Op','OP','Mission',
          'Committed Operation','Committed to Operation','Deployment','Exercise'
        ]);

        const chips = $('#mdChips', el);
        if(chips) chips.innerHTML = renderHeaderMeta({ status: statusVal, operation: opVal });

        const kv = (k,v)=>`<div class="info-row"><span class="k">${escapeXml(k)}</span><span class="v">${escapeXml((v??'').toString().trim() || '—')}</span></div>`;

        const adminHTML = ()=>{
          const rows = [
            kv('Billet', marine.billet || rf(['Billet'])),
            kv('MOS', marine.mos || rf(['MOS'])),
            kv('UNIT', marine.unit || rf(['UNIT','Unit'])),
            kv('Section', marine.section || marine.plt || rf(['Section'])),
            kv('Squad', marine.squad || rf(['Squad'])),
            kv('Team', marine.team || rf(['Team'])),
            kv('Email', marine.email || rf(['Email'])),
            kv('EDIPI', marine.edipi || rf(['EDIPI','DoD ID','DOD ID'])),
            kv('BIC', marine.bic || rf(['BIC'])),
            kv('Clearance', marine.clearance || rf(['Clearance']))
          ].join('');
          return `<div class="info-grid">${rows}</div>`;
        };

        const accountsHTML = ()=>{
          const rows = [
            kv('MCEN-S USER', rf(['MCEN-S USER'])),
            kv('MCEN-S ADMIN', rf(['MCEN-S ADMIN'])),
            kv('MCEN-N USER', rf(['MCEN-N USER'])),
            kv('MCEN-N ADMIN', rf(['MCEN-N ADMIN'])),
            kv('TIE-N USER', rf(['TIE-N USER'])),
            kv('TIE-N UA', rf(['TIE-N UA'])),
            kv('TIE-N SA', rf(['TIE-N SA'])),
            kv('TIE-N NA', rf(['TIE-N NA'])),
            kv('TIE-S USER', rf(['TIE-S USER'])),
            kv('TIE-S UA', rf(['TIE-S UA'])),
            kv('TIE-S SA', rf(['TIE-S SA'])),
            kv('TIE-S NA', rf(['TIE-S NA'])),
            kv('TIE-NS USER', rf(['TIE-NS USER'])),
            kv('TIE-NS UA', rf(['TIE-NS UA'])),
            kv('TIE-NS SA', rf(['TIE-NS SA'])),
            kv('TIE-NS NA', rf(['TIE-NA NA','TIE-NS NA']))
          ].join('');
          return `<div class="info-grid">${rows}</div>`;
        };

        const opsHTML = ()=>{
          const rows = [
            kv('Status', statusVal || rf(['Status'])),
            kv('Status Start', marine.statusStart || rf(['Status Start'])),
            kv('Status End', marine.statusEnd || rf(['Status End Date','Status End'])),
            kv('Current Operation', rf(['Current Operation','Current Operation  '])),
            kv('Current Op Start', marine.currentOpStart || rf(['Current Operation : Start Time','Current Operation  : Start Time'])),
            kv('Current Op End', marine.currentOpEnd || rf(['Current Operation : End Time','Current Operation  : End Time'])),
            kv('Future Operation', marine.futureOperation || rf(['Future Operation'])),
            kv('Future Op Start', marine.futureOpStart || rf(['Future Operation: Start Time','Future Operation : Start Time'])),
            kv('Future Op End', marine.futureOpEnd || rf(['Future Operation: End Time','Future Operation : End Time']))
          ].join('');
          return `<div class="info-grid">${rows}</div>`;
        };

        const trainingHTML = ()=>{
          const rows = [
            kv('PFT', rf(['PFT'])),
            kv('CFT', rf(['CFT'])),
            kv('CPTR', rf(['CPTR'])),
            kv('GAS CHAMBER', rf(['GAS CHAMBER'])),
            kv('CYBER AWARENESS/PII', rf(['CYBER AWARENESS/PII'])),
            kv('OPSEC', rf(['OPSEC'])),
            kv('LLES', rf(['LLES'])),
            kv('CORPORALS COURSE', rf(['CORPORALS COURSE'])),
            kv('SERGEANT SCHOOL', rf(['SERGEANT SCHOOL'])),
            kv('HUMVEE LICENSE', rf(['HUMVEE LICENSE'])),
            kv('JLTV LICENSE', rf(['JLTV LICENSE'])),
            kv('TCCC TIER 1', rf(['TCCC TIER 1'])),
            kv('TCCC TIER 2', rf(['TCCC TIER 2'])),
            kv('TCCC TIER 3', rf(['TCCC TIER 3'])),
            kv('TCCC TIER 4', rf(['TCCC TIER 4']))
          ].join('');
          return `<div class="info-grid">${rows}</div>`;
        };

        const profileTabs = [
          {id:'admin', label:'Admin'},
          {id:'accounts', label:'Accounts'},
          {id:'operations', label:'Operations'},
          {id:'training', label:'Training'}
        ];

        const pTabsEl = $('#mdProfileTabs', el);
        const pContentEl = $('#mdProfileContent', el);
        if(pTabsEl && pContentEl){
          pTabsEl.innerHTML = profileTabs.map((t,i)=>`<button class="ptab hud-chip ${i===0?'active':''}" data-pt="${t.id}">${escapeXml(t.label)}</button>`).join('');

          const renderTab = (id)=>{
            if(id==='accounts') return accountsHTML();
            if(id==='operations') return opsHTML();
            if(id==='training') return trainingHTML();
            return adminHTML();
          };

          pContentEl.innerHTML = renderTab('admin');

          $$('.ptab', pTabsEl).forEach(btn=>{
            btn.addEventListener('click', ()=>{
              $$('.ptab', pTabsEl).forEach(x=>x.classList.remove('active'));
              btn.classList.add('active');
              pContentEl.innerHTML = renderTab(btn.dataset.pt);
            });
          });
        }

        // ✅ uses root path logic now
        setAvatarEl($('#mdAvatar', el), {
          name,
          mos: marine.mos,
          MOS: marine.mos,
          billet: marine.billet,
          Billet: marine.billet
        }, `${(marine.firstName||'')[0]||''}${(marine.lastName||'')[0]||''}`.toUpperCase());

        const rubrics = (marine.rubrics || []).slice(0,4);
        const tabs = $('#mdTabs', el);
        tabs.innerHTML = RUBRIC_KEYS.map((rid)=>{
          const active = (openRubricId ? rid===openRubricId : rid===RUBRIC_KEYS[0]);
          return `<button class="tab hud-chip ${active?'active':''}" data-r="${escapeXml(rid)}">${escapeXml(RUBRIC_LABELS[rid]||rid)}</button>`;
        }).join('');

        const setRubric = (rid)=>{
          const r = rubrics.find(x=>x.id===rid) || makeEmptyRubric(rid);
          $('#mdRadar', el).innerHTML = bigRadarSVG(r, {marineId: marine.id, rubricId: rid});

          const list = $('#mdAreas', el);
          list.innerHTML = AREA_KEYS.map((k)=>{
            const a = (r.areas||[]).find(x=>x.key===k) || { score: 0 };
            const p = clamp(a.score||0,0,100);
            return `
              <div class="area-row">
                <span class="name">${escapeXml(AREA_LABELS[k])}</span>
                <div class="bar"><i style="width:${p}%"></i></div>
                <span class="score">${p}%</span>
              </div>
            `;
          }).join('');
        };

        setRubric(openRubricId || RUBRIC_KEYS[0]);
        $$('.tab', tabs).forEach(btn=>{
          btn.addEventListener('click', ()=>{
            $$('.tab', tabs).forEach(x=>x.classList.remove('active'));
            btn.classList.add('active');
            setRubric(btn.dataset.r);
          });
        });

        el.classList.add('show');
      }
    };
  }

  function buildAreaModal(){
    const el = document.createElement('div');
    el.className = 'md-modal';
    el.innerHTML = `
      <div class="md-dialog hud-shell" role="dialog" aria-modal="true" aria-label="Area detail" style="max-width: 820px;">
        <header>
          <div class="left">
            <div class="avatar" id="adAvatar">US</div>
            <div class="title">
              <b id="adTitle">Area Detail</b>
              <span id="adSub">Marine · Rubric</span>
            </div>
          </div>
          <button class="btn" id="adClose">Close</button>
        </header>
        <div class="panel hud-module" style="margin:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <div class="small" style="margin:0;">Area score</div>
              <div id="adScore" style="font-family: var(--display); font-size: 28px; letter-spacing:.6px;">0%</div>
            </div>
            <button class="btn" id="adOpenProfile">Open full profile</button>
          </div>
          <div style="margin-top:12px;" class="small" id="adNotes"></div>
          <div style="margin-top:12px;" class="footnote" id="adMeta"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const close = ()=>el.classList.remove('show');
    $('#adClose', el).addEventListener('click', close);
    el.addEventListener('click', (e)=>{ if(e.target === el) close(); });

    return {
      el,
      open: ({marine, rubricId, areaKey}, onOpenProfile)=>{
        const name = `${marine.rank||''} ${marine.firstName||''} ${marine.lastName||''}`.trim() || 'Marine';

        setAvatarEl($('#adAvatar', el), {
          name,
          MOS: marine.mos,
          mos: marine.mos,
          Billet: marine.billet,
          billet: marine.billet
        }, `${(marine.firstName||'')[0]||''}${(marine.lastName||'')[0]||''}`.toUpperCase());

        const r = (marine.rubrics || []).find(x=>x.id===rubricId) || makeEmptyRubric(rubricId);
        const a = (r.areas || []).find(x=>x.key===areaKey) || {score:0, notes:''};

        $('#adTitle', el).textContent = AREA_LABELS[areaKey] || 'Area';
        $('#adSub', el).textContent = `${marine.rank||''} ${marine.firstName||''} ${marine.lastName||''} · ${RUBRIC_LABELS[rubricId]||rubricId}`.trim();
        $('#adScore', el).textContent = `${clamp(a.score||0,0,100)}%`;

        const notes = (a.notes || a.evidence || a.detail || '').toString().trim();
        $('#adNotes', el).innerHTML = notes
          ? `<b>Notes / evidence:</b><br>${escapeXml(notes)}`
          : `<b>Notes / evidence:</b><br><span style="color: rgba(208,195,195,.75);">No notes provided in the CSV for this area yet.</span>`;

        const last = a.lastEval ? `Last eval: ${a.lastEval}` : '';
        const who = a.evaluator ? `Evaluator: ${a.evaluator}` : '';
        $('#adMeta', el).textContent = [last, who].filter(Boolean).join(' · ') || 'Tip: add *_notes, *_lastEval, *_evaluator columns to your CSV to enrich this view.';

        const btn = $('#adOpenProfile', el);
        btn.onclick = ()=>{ close(); onOpenProfile?.(marine, rubricId); };

        el.classList.add('show');
      }
    };
  }

  function buildTeamPanel(){
    const el = document.createElement('div');
    el.className = 'md-sidepanel';
    el.innerHTML = `
      <div class="md-sidepanel-overlay" data-close="1"></div>
      <div class="md-sidepanel-card hud-shell" role="dialog" aria-modal="true" aria-label="Team summary">
        <header>
          <div class="left">
            <div class="avatar" id="tpAvatar">T</div>
            <div class="title">
              <b id="tpTitle" class="hud-title">Team</b>
              <span id="tpSub">PLT · Squad</span>
            </div>
          </div>
          <button class="btn" id="tpClose" type="button">Close</button>
        </header>

        <div style="padding:16px;">
          <div class="panel hud-module">
            <div class="module-header">
              <h5 class="hud-title">Summary</h5>
              <span class="hud-label" id="tpBasis">Basis</span>
            </div>

            <div class="tp-stats" style="padding:14px;">
              <div class="tp-stat"><div class="k">Avg</div><div class="v" id="tpAvg">0%</div></div>
              <div class="tp-stat"><div class="k">Scored</div><div class="v" id="tpScored">0/0</div></div>
              <div class="tp-stat"><div class="k">Top area</div><div class="v" id="tpTopArea">—</div></div>
              <div class="tp-stat"><div class="k">Lowest area</div><div class="v" id="tpLowArea">—</div></div>
            </div>

            <div class="small" id="tpNote" style="padding:0 14px 14px; color: rgba(208,195,195,.72);"></div>

            <div class="tp-ranks" style="padding:0 14px 14px;">
              <div class="tp-col">
                <div class="hud-label" style="margin-bottom:10px;">Top 3 in Team</div>
                <div class="tp-list" id="tpTop3"></div>
              </div>
              <div class="tp-col">
                <div class="hud-label" style="margin-bottom:10px;">Bottom 3 in Team</div>
                <div class="tp-list" id="tpBottom3"></div>
              </div>
            </div>

            <div class="footnote" style="padding:0 14px 14px;">Tip: change the Specialty filter (if enabled) to see rankings and area highs/lows update.</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    const close = ()=> el.classList.remove('show');
    el.addEventListener('click', (e)=>{
      const t = e.target;
      if(t && (t.id==='tpClose' || t.getAttribute('data-close')==='1')) close();
    });

    const rowHTML = (x)=>`
      <div class="tp-row">
        <div>
          <div class="nm">${escapeXml(x.name||'—')}</div>
          <div class="meta">${escapeXml(x.mos||'—')}</div>
        </div>
        <div class="sc">${escapeXml(String(x.score??'—'))}%</div>
      </div>
    `;

    return {
      el,
      open: (data)=>{
        $('#tpTitle', el).textContent = data.title || 'Team';
        $('#tpSub', el).textContent = data.subtitle || '';
        $('#tpBasis', el).textContent = `Basis: ${data.basis || ''}`;
        $('#tpAvg', el).textContent = `${data.avg ?? 0}%`;
        $('#tpScored', el).textContent = data.scored || '0/0';
        $('#tpTopArea', el).textContent = data.topArea || '—';
        $('#tpLowArea', el).textContent = data.lowArea || '—';
        $('#tpNote', el).textContent = data.note || '';
        const av = (data.title||'T').trim()[0] || 'T';
        $('#tpAvatar', el).textContent = av.toUpperCase();

        $('#tpTop3', el).innerHTML = (data.top3||[]).map(rowHTML).join('') || `<div class="small">—</div>`;
        $('#tpBottom3', el).innerHTML = (data.bottom3||[]).map(rowHTML).join('') || `<div class="small">—</div>`;
        el.classList.add('show');
      },
      close
    };
  }

  // ---- Filters ----
  function applyFilter(roster, state){
    const q = (state.q||'').trim().toLowerCase();
    return roster.filter(m=>{
      if(!q) return true;
      const hay = `${m.rank||''} ${m.firstName||''} ${m.lastName||''} ${m.mos||''} ${m.email||''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // ---- CSV ingest helpers ----
  function normalizeHeader(h){
    return String(h||'')
      .replace(/[\uFEFF\u00A0]/g,' ')
      .trim()
      .replace(/\s+/g,' ');
  }

  const MONTH_INDEX = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  function monthIndexFromWord(word){
    const k = String(word||'').trim().toLowerCase();
    return MONTH_INDEX[k] || 0;
  }

  function parseTitleHeader(header){
    const raw = normalizeHeader(header);
    const m = raw.match(/^([A-Za-z]+)\s+(\d{4})\s+(.+)$/);
    if(!m) return null;
    return {
      raw,
      monthWord: m[1],
      monthIdx: monthIndexFromWord(m[1]),
      mosDigits: m[2],
      areaText: (m[3]||'').trim(),
    };
  }

  function parseCSV(text){
    const rows=[];
    let i=0, field='', row=[], inQuotes=false;
    while(i<text.length){
      const c=text[i];
      if(inQuotes){
        if(c==='"' && text[i+1]==='"'){ field+='"'; i+=2; continue; }
        if(c==='"'){ inQuotes=false; i++; continue; }
        field+=c; i++; continue;
      }
      if(c==='"'){ inQuotes=true; i++; continue; }
      if(c===','){ row.push(field); field=''; i++; continue; }
      if(c==='\n'){
        row.push(field); field='';
        if(row.length===1 && row[0]==='' ){ i++; row=[]; continue; }
        rows.push(row);
        row=[];
        i++; continue;
      }
      if(c==='\r'){ i++; continue; }
      field+=c; i++;
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    if(!rows.length) return [];

    const headers = rows[0].map(normalizeHeader);
    const out=[];
    for(let r=1;r<rows.length;r++){
      const vals = rows[r];
      if(vals.every(v=>String(v||'').trim()==='')) continue;
      const obj={};
      headers.forEach((h, idx)=>{ obj[h] = (vals[idx] ?? '').toString().trim(); });
      out.push(obj);
    }
    return out;
  }

  function getField(row, names){
    for(const n of names){
      if(n in row && String(row[n]).trim()!=='') return row[n];
      const found = Object.keys(row).find(k=>k.trim().toLowerCase()===String(n).trim().toLowerCase());
      if(found && String(row[found]).trim()!=='') return row[found];
    }
    return '';
  }

  function toIntMaybe(v){
    if(v === null || v === undefined) return null;
    const raw = String(v).trim();
    if(!raw) return null;
    const hadPct = raw.includes('%');
    const cleaned = raw.replace(/%/g,'').replace(/,/g,'').trim();
    const n = parseFloat(cleaned);
    if(!Number.isFinite(n)) return null;

    let out = n;
    if(!hadPct && out >= 0 && out <= 1) out = out * 100;

    if(out < 0) out = 0;
    if(out > 100) out = 100;
    return out;
  }

  function getAreaValueFromRow(row, rubricId, areaKey){
    const prefs = PREFIX_BY_RUBRIC[rubricId] || [rubricId];
    const keys = [];
    for(const p of prefs){
      const base = String(p).toUpperCase();
      keys.push(`${base}_${areaKey}`);
      keys.push(`${base}_${areaKey.toUpperCase()}`);
      keys.push(`${base}_${areaKey.toUpperCase()}_SCORE`);
      keys.push(`${base}_${areaKey}_SCORE`);
      keys.push(`${base}-${areaKey}`);
      keys.push(`${base} ${areaKey}`);
      keys.push(`${base} ${areaKey.toUpperCase()}`);
      keys.push(`${base}_${areaKey}_PCT`);
    }

    for(const k of keys){
      const v = getField(row, [k]);
      const n = toIntMaybe(v);
      if(n !== null) return clamp(n, 0, 100);
    }

    const mosSet = (String(rubricId||'').match(/\d{3,4}/g) || []).map(m => String(m).padStart(4,'0'));
    const areaTitles = {
      planning: ['mission planning and preparation','planning and preparation'],
      setup: ['systems setup and configuration','system setup and configuration','setup and configuration'],
      ops: ['operations and employment','operations employment','operations and utilization','operations and utilization'],
      trouble: ['troubleshooting and maintenance','troubleshooting maintenance','maintenance'],
      security: ['security safety and leadership','security, safety and leadership','security safety leadership','safety and leadership']
    };
    const want = (areaTitles[areaKey] || []).map(s=>String(s).toLowerCase());

    if(mosSet.length && want.length){
      let best = null;
      for(const hk of Object.keys(row||{})){
        const parsed = parseTitleHeader(hk);
        if(!parsed) continue;
        if(!mosSet.includes(String(parsed.mosDigits))) continue;

        const areaNorm = String(parsed.areaText||'')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g,' ')
          .replace(/\s+/g,' ')
          .trim();
        if(!want.some(t=>areaNorm.includes(String(t).toLowerCase()))) continue;

        const n = toIntMaybe(row[hk]);
        if(n === null) continue;
        const score = clamp(n, 0, 100);

        if(!best || (parsed.monthIdx || 0) > (best.monthIdx || 0)){
          best = { monthIdx: parsed.monthIdx || 0, score };
        }
      }
      if(best) return best.score;

      for(const hk of Object.keys(row||{})){
        const nh = normalizeHeader(hk)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g,' ')
          .replace(/\s+/g,' ')
          .trim();
        if(!mosSet.some(m=>nh.includes(m))) continue;
        if(!want.some(t=>nh.includes(t))) continue;
        const n = toIntMaybe(row[hk]);
        if(n !== null) return clamp(n, 0, 100);
      }
    }

    const letterMap = { planning: 'BM', setup: 'BN', ops: 'BO', trouble: 'BP', security: 'BQ' };
    const lk = letterMap[areaKey];
    if(lk && lk in (row||{})){
      const n = toIntMaybe(row[lk]);
      if(n !== null) return clamp(n, 0, 100);
    }

    return 0;
  }

  function getAreaNotesFromRow(row, rubricId, areaKey){
    const prefs = PREFIX_BY_RUBRIC[rubricId] || [rubricId];
    const candidates=[];
    for(const p of prefs){
      const base = String(p).toUpperCase();
      candidates.push(`${base}_${areaKey}_notes`);
      candidates.push(`${base}_${areaKey}_NOTES`);
      candidates.push(`${base}_${areaKey}_comment`);
      candidates.push(`${base}_${areaKey}_COMMENT`);
      candidates.push(`${base}_${areaKey}_evidence`);
      candidates.push(`${base}_${areaKey}_EVIDENCE`);
    }
    return getField(row, candidates);
  }

  function getAreaMetaFromRow(row, rubricId, areaKey){
    const prefs = PREFIX_BY_RUBRIC[rubricId] || [rubricId];
    const candidates=(suffix)=>{
      const out=[];
      for(const p of prefs){
        const base = String(p).toUpperCase();
        out.push(`${base}_${areaKey}_${suffix}`);
        out.push(`${base}_${areaKey}_${suffix.toUpperCase()}`);
      }
      return out;
    };
    return {
      lastEval: getField(row, candidates('lastEval').concat(candidates('last').concat(candidates('date')))),
      evaluator: getField(row, candidates('evaluator').concat(candidates('who')))
    };
  }

  function rowToMarine(row){
    let rank = getField(row, ['Rank','rank']);
    let firstName = getField(row, ['First Name','first name','First','firstname']);
    let lastName = getField(row, ['Last Name','last name','Last','lastname']);

    const marineNameRaw = getField(row, ['Marine Name','MarineName','Name','Full Name','FullName','Marine']);
    if ((!firstName && !lastName) && marineNameRaw) {
      const parsed = parseMarineName(marineNameRaw, rank);
      rank = rank || parsed.rank;
      firstName = firstName || parsed.firstName;
      lastName = lastName || parsed.lastName;
    }

    const email = getField(row, ['Email','email']);
    const edipi = getField(row, ['EDIPI','edipi','DoD ID','DOD ID']);
    const mos = normalizeMOS(getField(row, ['MOS','mos','Mos','MOS Code','MOS code']));
    const billet = getField(row, ['Billet','billet']);

    const sectionRaw = getField(row, ['Section','section','SECTION','PLT','Plt','plt']);
    const plt = (sectionRaw || 'HQ').toString().trim() || 'HQ';

    const squadRaw = getField(row, ['Squad','squad']);
    const teamRaw  = getField(row, ['Team','team']);

    const squad = (squadRaw && String(squadRaw).trim()) ? String(squadRaw).trim() : 'Platoon Staff';
    const team = (teamRaw && String(teamRaw).trim()) ? String(teamRaw).trim() : (squad && squad !== 'Platoon Staff' ? 'No Team' : 'Platoon Staff');

    const status = getField(row, ['Status','status','Marine Status','STATUS']);

    const id = (edipi || email || `${lastName}_${firstName}_${mos}`).toString().trim();

    const rubrics = RUBRIC_KEYS.map((rid)=>{
      const areas = AREA_KEYS.map((ak)=>{
        const score = getAreaValueFromRow(row, rid, ak);
        const notes = getAreaNotesFromRow(row, rid, ak);
        const meta = getAreaMetaFromRow(row, rid, ak);
        return { key: ak, label: AREA_LABELS[ak], score, notes, ...meta };
      });
      return { id: rid, areas };
    });

    return {
      id,
      rank,
      firstName,
      lastName,
      email,
      section: plt,
      plt,
      squad,
      team,
      mos,
      billet,
      status,
      rubrics,
      raw: row
    };
  }

  function makeEmptyRubric(rid){
    return { id: rid, areas: AREA_KEYS.map(k=>({key:k, label: AREA_LABELS[k], score: 0})) };
  }

  // ---- Main mount ----
  async function mount(rootSel, opts={}){
    const root = (typeof rootSel === 'string') ? document.querySelector(rootSel) : rootSel;
    if(!root) throw new Error('Mount root not found');

    const rosterUrl = (typeof opts.rosterUrl !== 'undefined') ? opts.rosterUrl : DEFAULT_ROSTER_URL;
    const homeUrl = opts.homeUrl || '';

    root.innerHTML = `
      <div class="md-wrap">
        <div class="top-bar">
          <div class="top-left">
            <div class="brand">
              <div class="mark"></div>
              <div>
                <div class="title">USMC Communications</div>
                <div class="sub">Proficiency Dashboard · Code Name <span style="color: var(--danger);">AGONY</span></div>
              </div>
            </div>
            ${homeUrl ? `<a class="btn" href="${escapeXml(homeUrl)}" target="_blank" rel="noopener">Open Agony App</a>` : ''}
          </div>

          <div class="md-controls">
            <input class="md-input" id="mdSearch" placeholder="Search name / MOS / email" />
            <button class="btn" id="mdTop" type="button">Top</button>
            <button class="btn" id="mdBack" type="button">Back</button>
            <button class="btn" id="mdLoadCsv" type="button">Load CSV</button>
            <input id="mdCsv" type="file" accept=".csv,text/csv" style="display:none" />
            <span class="md-pill">Showing <b id="mdCount">0</b></span>
          </div>
        </div>

        <div class="md-breadcrumb" id="mdBreadcrumb"></div>
        <div class="md-content" id="mdGroups">
          <div class="panel" style="margin-top: 14px;">
            <h5>No roster loaded</h5>
            <div class="footnote">Use <b>Load CSV</b> each session to import your roster and rubric scores.</div>
          </div>
        </div>
      </div>
    `;

    const profileModal = buildProfileModal();
    const areaModal = buildAreaModal();
    const teamPanel = buildTeamPanel();

    let roster = [];
    try{
      if(rosterUrl){
        const res = await fetch(rosterUrl, {cache:'no-store'});
        if(res.ok){
          const data = await res.json();
          roster = Array.isArray(data) ? data : [];
        }
      }
    }catch(_){
      roster = [];
    }

    if(!roster.length){
      $('#mdGroups', root).innerHTML = `
        <div class="panel" style="margin-top: 14px;">
          <h5>No roster loaded yet</h5>
          <div class="small">Use <b>Load CSV</b> to import your roster.</div>
        </div>
      `;
    }

    const crumbsEl = $('#mdBreadcrumb', root);
    const topBtn = $('#mdTop', root);
    const backBtn = $('#mdBack', root);

    const state = { q:'', nav: { plt: null, squad: null, team: null } };

    function wireInteractions(){
      $$('.card', root).forEach(card=>{
        if(card.__md_hooked) return;
        card.__md_hooked = true;
        card.addEventListener('click', ()=>{
          const id = card.dataset.id;
          const m = roster.find(x=>String(x.id)===String(id));
          if(m) profileModal.open(m);
        });
      });

      if(!document.__md_radar_delegate){
        document.__md_radar_delegate = true;
        document.addEventListener('click', (e)=>{
          const target = (e.target && e.target.closest) ? e.target.closest('.radar-point') : e.target;
          if(!target || !target.classList || !target.classList.contains('radar-point')) return;

          e.preventDefault();
          e.stopPropagation();

          const mid = target.getAttribute('data-mid');
          const rid = target.getAttribute('data-rid');
          const ak = target.getAttribute('data-ak');
          if(!mid || !rid || !ak) return;

          const m = roster.find(x=>String(x.id)===String(mid));
          if(!m) return;
          areaModal.open(
            { marine: m, rubricId: rid, areaKey: ak },
            (marine, openRid)=>profileModal.open(marine, openRid)
          );
        }, true);
      }
    }

    function render(){
      const filtered = applyFilter(roster, state);
      const view = renderHierarchy($('#mdGroups', root), filtered, state.nav, crumbsEl);
      $('#mdCount', root).textContent = String(view.count);
      backBtn.disabled = !state.nav.plt;
      wireInteractions();
    }

    render();

    $('#mdSearch', root).addEventListener('input', (e)=>{ state.q = e.target.value; render(); });

    const viewRoot = $('#mdGroups', root);
    viewRoot.addEventListener('click', (e)=>{
      const tp = e.target.closest ? e.target.closest('.team-panel-trigger') : null;
      if(tp){
        e.preventDefault();
        e.stopPropagation();
        const raw = tp.getAttribute('data-panel') || '';
        let parsed = null;
        try{ parsed = raw ? JSON.parse(raw) : null; }catch(_){ parsed = null; }
        if(parsed) teamPanel.open(parsed);
        return;
      }

      const node = e.target.closest ? e.target.closest('.node') : null;
      if(node){
        const mid = node.getAttribute('data-mid');
        const m = roster.find(x=>String(x.id)===String(mid));
        if(m) profileModal.open(m);
        return;
      }

      const tile = e.target.closest ? e.target.closest('.tile') : null;
      if(tile){
        const kind = tile.getAttribute('data-kind');
        const value = tile.getAttribute('data-value');
        if(kind==='plt') state.nav = { plt: value, squad: null, team: null };
        render();
        return;
      }
    });

    crumbsEl.addEventListener('click', (e)=>{
      const crumb = e.target.closest ? e.target.closest('.crumb') : null;
      if(!crumb) return;
      const navKind = crumb.getAttribute('data-nav');
      if(navKind==='root') state.nav = {plt:null,squad:null,team:null};
      if(navKind==='plt') state.nav = {plt: state.nav.plt, squad:null, team:null};
      render();
    });

    topBtn.addEventListener('click', ()=>{ state.nav = {plt:null,squad:null,team:null}; render(); });
    backBtn.addEventListener('click', ()=>{
      state.nav.plt = null;
      state.nav.squad = null;
      state.nav.team = null;
      render();
    });

    const fileInput = $('#mdCsv', root);
    $('#mdLoadCsv', root).addEventListener('click', ()=> fileInput.click());

    fileInput.addEventListener('change', async ()=>{
      const file = fileInput.files?.[0];
      if(!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      roster = rows.map(rowToMarine);
      state.q='';
      state.nav = {plt:null,squad:null,team:null};
      $('#mdSearch', root).value='';
      render();
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){
        profileModal.el.classList.remove('show');
        areaModal.el.classList.remove('show');
      }
    });
  }

  window.MarineDashboard = { mount };

  function normalizeMOS(value) {
    if (value === null || value === undefined) return '';
    let s = String(value).trim();
    if (!s) return '';
    s = s.replace(/,/g,'');
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Math.floor(parseFloat(s));
      if (Number.isFinite(n)) s = String(n);
    }
    s = s.replace(/\D/g,'');
    if (!s) return '';
    if (s.length < 4) s = s.padStart(4,'0');
    return s;
  }

  const KNOWN_RANKS = [
    'PVT','PFC','LCPL','CPL','SGT','SSGT','GYSGT','MSGT','1STSGT','SGTMAJ','MGYSGT',
    'WO1','CWO2','CWO3','CWO4','CWO5',
    '2NDLT','1STLT','CAPT','MAJ','LTCOL','COL','BGEN','MGEN','LTGEN','GEN'
  ];

  function parseMarineName(full, fallbackRank='') {
    const raw = (full || '').trim();
    if (!raw) return { rank: fallbackRank || '', firstName: '', lastName: '' };
    const parts = raw.replace(/\s+/g,' ').split(' ');
    let rank = (fallbackRank || '').trim();
    let startIdx = 0;

    if (!rank) {
      const cand1 = (parts[0] || '').toUpperCase().replace(/\./g,'');
      if (KNOWN_RANKS.includes(cand1)) { rank = parts[0]; startIdx = 1; }
    }

    const nameParts = parts.slice(startIdx);
    if (nameParts.length === 0) return { rank, firstName: '', lastName: '' };
    if (nameParts.length === 1) return { rank, firstName: nameParts[0], lastName: '' };
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts.slice(0, -1).join(' ');
    return { rank, firstName, lastName };
  }
})();
