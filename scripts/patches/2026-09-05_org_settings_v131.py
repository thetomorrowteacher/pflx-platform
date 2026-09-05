import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()


def apply(name, old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f'MISMATCH for "{name}": expected {count}, found {n}')
        sys.exit(1)
    src = src.replace(old, new, count)


# ─── 1. Insert ORG_TIER_META right after the ORGANIZATIONS literal ─────────
apply(
    "ORG_TIER_META insertion",
    "        };\n\n        // ── Cohorts (with org grouping + tiered access) ──",
    """        };

        // ── Org plan tiers (Fall 2026 Season Rate Card) ──────────────────
        // 'free' = Independent/no plan (STANDALONE). The other four match the
        // Rate Card's Organisation tiers exactly (cohort cap, seat cap, and
        // which Rate-Card features are included at that tier). Picking a tier
        // in the org editor auto-fills these as a starting point — every
        // value stays manually editable per-org afterward (see
        // hmcOrgTierAutofill / hmcOpenOrgEditor).
        const ORG_TIER_META = {
            free:       { label: 'Independent', color: '#8a92b0', maxCohorts: null, maxPlayers: null,
                           flags: { crossCohortLeaderboard: false, fridayShowdown: false, seasonTheming: false, termlyImpactReport: false, sponsorIntegration: false, hostCertifiedStaff: 0 } },
            essential:  { label: 'Org Essential', color: '#34d399', maxCohorts: 3, maxPlayers: 90,
                           flags: { crossCohortLeaderboard: true, fridayShowdown: true, seasonTheming: false, termlyImpactReport: false, sponsorIntegration: false, hostCertifiedStaff: 0 } },
            plus:       { label: 'Org Plus', color: '#f5c842', maxCohorts: 6, maxPlayers: 180,
                           flags: { crossCohortLeaderboard: true, fridayShowdown: true, seasonTheming: true, termlyImpactReport: false, sponsorIntegration: false, hostCertifiedStaff: 6 } },
            campus:     { label: 'Org Campus', color: '#a78bfa', maxCohorts: 12, maxPlayers: 360,
                           flags: { crossCohortLeaderboard: true, fridayShowdown: true, seasonTheming: true, termlyImpactReport: true, sponsorIntegration: true, hostCertifiedStaff: 6 } },
            enterprise: { label: 'Org Enterprise', color: '#00d4ff', maxCohorts: null, maxPlayers: null,
                           flags: { crossCohortLeaderboard: true, fridayShowdown: true, seasonTheming: true, termlyImpactReport: true, sponsorIntegration: true, hostCertifiedStaff: 0 } }
        };
        // Apply a tier's defaults onto the currently-open org editor modal's
        // inputs. Manual — fires only when the host changes the Subscription
        // Tier dropdown, never silently on load, so existing org data is
        // never overwritten just by opening the editor.
        window.hmcOrgTierAutofill = function (tier) {
            var meta = ORG_TIER_META[tier];
            if (!meta) return;
            var capEl = document.getElementById('org-edit-cap');
            var cohortsCapEl = document.getElementById('org-edit-max-cohorts');
            if (capEl) capEl.value = meta.maxPlayers === null ? '' : meta.maxPlayers;
            if (cohortsCapEl) cohortsCapEl.value = meta.maxCohorts === null ? '' : meta.maxCohorts;
            var f = meta.flags || {};
            ['crossCohortLeaderboard', 'fridayShowdown', 'seasonTheming', 'termlyImpactReport', 'sponsorIntegration'].forEach(function (k) {
                var el = document.querySelector('#pflx-org-editor-modal input[data-plan-feat="' + k + '"]');
                if (el) el.checked = !!f[k];
            });
            var hostEl = document.getElementById('org-edit-host-staff');
            if (hostEl) hostEl.value = f.hostCertifiedStaff || 0;
        };

        // ── Cohorts (with org grouping + tiered access) ──""",
)

# ─── 2. hmcRenderOrgs — tier lookup + logo avatar + cap/feature display ────
apply(
    "tierColors lookup",
    """                const tierColors = { free: '#8a92b0', standard: '#34d399', premium: '#f5c842', enterprise: '#a78bfa' };
                const tierColor = tierColors[org.subscription] || '#8a92b0';""",
    """                const tierMeta = ORG_TIER_META[org.subscription] || null;
                const tierColor = tierMeta ? tierMeta.color : '#8a92b0';
                const tierLabel = tierMeta ? tierMeta.label : String(org.subscription || '').toUpperCase();
                const orgInitials = (escapeHtml(org.shortName || org.name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?');
                const orgLogoHtml = org.logo
                    ? `<img src="${org.logo}" alt="" style="width:56px;height:56px;border-radius:10px;object-fit:contain;background:rgba(255,255,255,0.04);border:1px solid ${tierColor}40;flex:none;">`
                    : `<div style="width:56px;height:56px;border-radius:10px;background:${tierColor}18;border:1px solid ${tierColor}40;color:${tierColor};display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:0.5px;flex:none;">${orgInitials}</div>`;
                const orgMaxCohorts = (org.maxCohorts === undefined || org.maxCohorts === null || org.maxCohorts === Infinity) ? null : org.maxCohorts;
                const planPills = [];
                if (org.crossCohortLeaderboard) planPills.push('🏆 Cross-Cohort Leaderboard');
                if (org.fridayShowdown) planPills.push('🎮 Friday Showdown');
                if (org.seasonTheming) planPills.push('🎨 Season Theming');
                if (org.termlyImpactReport) planPills.push('📊 Termly Report');
                if (org.sponsorIntegration) planPills.push('🤝 Sponsor Integration');
                if (org.hostCertifiedStaff) planPills.push('🎓 ' + org.hostCertifiedStaff + ' Certified Host' + (org.hostCertifiedStaff === 1 ? '' : 's'));
                if (org.namedPointOfContact) planPills.push('👤 ' + escapeHtml(org.namedPointOfContact));""",
)

apply(
    "card header — avatar + tier label",
    """                card.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <div>
                            <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:#e0e6ff;letter-spacing:1px;">${escapeHtml(org.name)}</div>
                            <div style="font-size:11px;color:#6a7290;font-family:'Jura',sans-serif;">${escapeHtml(org.shortName)} · ${escapeHtml(org.contact || 'No contact')}</div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                            <span style="font-size:9px;padding:3px 10px;border-radius:4px;font-family:'Orbitron',sans-serif;letter-spacing:1px;background:${tierColor}18;border:1px solid ${tierColor}40;color:${tierColor};">${escapeHtml(org.subscription.toUpperCase())}</span>""",
    """                card.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;">
                        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                            ${orgLogoHtml}
                            <div style="min-width:0;">
                                <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:#e0e6ff;letter-spacing:1px;">${escapeHtml(org.name)}</div>
                                <div style="font-size:11px;color:#6a7290;font-family:'Jura',sans-serif;">${escapeHtml(org.shortName)} · ${escapeHtml(org.contact || 'No contact')}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                            <span style="font-size:9px;padding:3px 10px;border-radius:4px;font-family:'Orbitron',sans-serif;letter-spacing:1px;background:${tierColor}18;border:1px solid ${tierColor}40;color:${tierColor};">${escapeHtml(tierLabel.toUpperCase())}</span>""",
)

apply(
    "cohorts stat — show max cap",
    """                        <div style="text-align:center;">
                            <div style="font-family:'Orbitron',sans-serif;font-size:18px;color:var(--cyan);">${cohortCount}</div>
                            <div style="font-size:10px;color:#8a92b0;">Cohorts</div>
                        </div>""",
    """                        <div style="text-align:center;">
                            <div style="font-family:'Orbitron',sans-serif;font-size:18px;color:var(--cyan);">${cohortCount}${orgMaxCohorts !== null ? `<span style=\"font-size:11px;color:#4a5170;\"> / ${orgMaxCohorts}</span>` : ''}</div>
                            <div style="font-size:10px;color:#8a92b0;">Cohorts</div>
                        </div>""",
)

apply(
    "plan-feature pill row",
    """                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(org.cohorts || []).map(c => `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.12);color:var(--cyan);font-family:'Share Tech Mono',monospace;">${escapeHtml(c)}</span>`).join('') || '<span style="font-size:10px;color:rgba(255,255,255,0.3);font-style:italic;">No cohorts assigned</span>'}
                    </div>
                `;
                container.appendChild(card);""",
    """                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(org.cohorts || []).map(c => `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.12);color:var(--cyan);font-family:'Share Tech Mono',monospace;">${escapeHtml(c)}</span>`).join('') || '<span style="font-size:10px;color:rgba(255,255,255,0.3);font-style:italic;">No cohorts assigned</span>'}
                    </div>
                    ${planPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">${planPills.map(p => `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${tierColor}10;border:1px solid ${tierColor}30;color:${tierColor};font-family:'Jura',sans-serif;">${p}</span>`).join('')}</div>` : ''}
                `;
                container.appendChild(card);""",
)

# ─── 3. hmcOpenOrgEditor — logo upload block ───────────────────────────────
apply(
    "logo helper fns before hmcOpenOrgEditor",
    "window.hmcOpenOrgEditor = function (orgKey) {",
    """// Logo upload for the org editor modal — resize to fit inside 300x300
        // (preserve aspect ratio, no crop) and store as a PNG data URI so a
        // transparent-background crest/logo stays transparent. Mirrors the
        // Loading Gallery's FileReader -> canvas -> toDataURL pattern.
        window.hmcOrgLogoPicked = function (input) {
            if (!input.files || !input.files[0]) return;
            var file = input.files[0];
            if (file.size > 5 * 1024 * 1024) { if (typeof pflxToast === 'function') pflxToast('Max 5MB image', 'error'); return; }
            var reader = new FileReader();
            reader.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    var maxDim = 300;
                    var w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                        else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                    }
                    var canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    var dataUrl = canvas.toDataURL('image/png');
                    var dataEl = document.getElementById('org-edit-logo-data');
                    if (dataEl) dataEl.value = dataUrl;
                    var prev = document.getElementById('org-edit-logo-preview');
                    var ph = document.getElementById('org-edit-logo-placeholder');
                    if (prev) { prev.src = dataUrl; prev.style.display = ''; }
                    if (ph) ph.style.display = 'none';
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        };
        window.hmcOrgLogoRemove = function () {
            var dataEl = document.getElementById('org-edit-logo-data');
            if (dataEl) dataEl.value = '';
            var prev = document.getElementById('org-edit-logo-preview');
            var ph = document.getElementById('org-edit-logo-placeholder');
            if (prev) { prev.removeAttribute('src'); prev.style.display = 'none'; }
            if (ph) ph.style.display = '';
        };
        window.hmcOpenOrgEditor = function (orgKey) {""",
)

apply(
    "identity grid — insert logo block as first child",
    """                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">' +
                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Organization Name</label>""",
    """                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">' +
                        '<div style="grid-column:1/-1;display:flex;align-items:center;gap:16px;padding:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;">' +
                            '<img id="org-edit-logo-preview" src="' + (org.logo ? escapeHtml(org.logo) : '') + '" style="width:64px;height:64px;border-radius:10px;object-fit:contain;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);' + (org.logo ? '' : 'display:none;') + '">' +
                            '<div id="org-edit-logo-placeholder" style="width:64px;height:64px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:10px;text-align:center;' + (org.logo ? 'display:none;' : '') + '">No logo</div>' +
                            '<div>' +
                                '<label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);display:block;margin-bottom:6px;">Organization Logo (300×300 recommended)</label>' +
                                '<input type="file" accept="image/*" onchange="hmcOrgLogoPicked(this)" style="font-size:11px;color:rgba(255,255,255,0.6);">' +
                                '<input type="hidden" id="org-edit-logo-data" value="' + (org.logo ? escapeHtml(org.logo) : '') + '">' +
                                (org.logo ? ' <button type="button" onclick="hmcOrgLogoRemove()" style="margin-left:8px;font-size:10px;padding:4px 10px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;cursor:pointer;">Remove</button>' : '') +
                            '</div>' +
                        '</div>' +
                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Organization Name</label>""",
)

# ─── 4. Subscription Tier select — new vocabulary + autofill onchange ──────
apply(
    "org-edit-sub tier options",
    """                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Subscription Tier</label><select id="org-edit-sub" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;">' +
                            ['free','standard','premium','enterprise'].map(function (t) { return '<option value="' + t + '"' + (org.subscription === t ? ' selected' : '') + '>' + t.toUpperCase() + '</option>'; }).join('') +
                        '</select></div>' +""",
    """                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Subscription Tier</label><select id="org-edit-sub" onchange="hmcOrgTierAutofill(this.value)" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;">' +
                            (Object.keys(ORG_TIER_META).indexOf(org.subscription) < 0 && org.subscription ? [org.subscription] : []).concat(Object.keys(ORG_TIER_META)).map(function (t) {
                                var lbl = ORG_TIER_META[t] ? ORG_TIER_META[t].label : String(t).toUpperCase() + ' (legacy)';
                                return '<option value="' + t + '"' + (org.subscription === t ? ' selected' : '') + '>' + lbl + '</option>';
                            }).join('') +
                        '</select></div>' +""",
)

# ─── 5. Max Players input — add Max Cohorts right after it ─────────────────
apply(
    "max cohorts field after max players",
    """                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Max Players</label><input id="org-edit-cap" type="number" min="0" value="' + (org.maxPlayers === Infinity ? '' : (org.maxPlayers || '')) + '" placeholder="(blank = unlimited)" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;"></div>' +
                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);display:block;">Active</label>' +""",
    """                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Max Players</label><input id="org-edit-cap" type="number" min="0" value="' + (org.maxPlayers === Infinity || org.maxPlayers == null ? '' : org.maxPlayers) + '" placeholder="(blank = unlimited)" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;"></div>' +
                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Max Cohorts</label><input id="org-edit-max-cohorts" type="number" min="0" value="' + (org.maxCohorts === Infinity || org.maxCohorts == null ? '' : org.maxCohorts) + '" placeholder="(blank = unlimited)" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;"></div>' +
                        '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);display:block;">Active</label>' +""",
)

# ─── 6. Plan Features box — inserted after Master App Access, before cohort checkboxes ─
apply(
    "Plan Features box insertion",
    """                        '</div>' +
                    '</div>' +
                    // Cohort checkboxes""",
    """                        '</div>' +
                    '</div>' +
                    // Organization Plan Features (Rate Card) — auto-filled by
                    // tier above, always manually overridable per-org.
                    '<div style="margin-bottom:14px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.2);border-radius:10px;padding:14px;">' +
                        '<label style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--cyan);font-weight:700;display:block;margin-bottom:4px;">🏛 Organization Plan Features (Rate Card)</label>' +
                        '<p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 12px;font-family:Jura,sans-serif;">Auto-filled by Subscription Tier above — override anything per-org.</p>' +
                        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px;">' +
                            [
                                {key:'crossCohortLeaderboard', label:'Cross-Cohort Leaderboard'},
                                {key:'fridayShowdown',         label:'Friday Showdown'},
                                {key:'seasonTheming',          label:'Season Theming'},
                                {key:'termlyImpactReport',     label:'Termly Impact Report'},
                                {key:'sponsorIntegration',     label:'Sponsor Integration'}
                            ].map(function (f) {
                                var checked = !!org[f.key];
                                return '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;cursor:pointer;font-size:12px;color:#e0e6ff;">' +
                                    '<input type="checkbox" data-plan-feat="' + f.key + '"' + (checked ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:#00d4ff;cursor:pointer;">' +
                                    escapeHtml(f.label) + '</label>';
                            }).join('') +
                        '</div>' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
                            '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Certified Host Staff</label><input id="org-edit-host-staff" type="number" min="0" value="' + (org.hostCertifiedStaff || 0) + '" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;"></div>' +
                            '<div><label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Named Point of Contact</label><input id="org-edit-poc" type="text" value="' + escapeHtml(org.namedPointOfContact || '') + '" placeholder="e.g. Dr. Amina Rashid" style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;background:rgba(10,18,40,0.6);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;outline:none;"></div>' +
                        '</div>' +
                    '</div>' +
                    // Cohort checkboxes""",
)

# ─── 7. hmcSaveOrgEditor — persist the new fields ───────────────────────────
apply(
    "save new fields",
    """            var capVal = (document.getElementById('org-edit-cap')?.value || '').trim();
            org.maxPlayers = capVal === '' ? Infinity : (parseInt(capVal, 10) || 0);
            org.active = !!document.getElementById('org-edit-active')?.checked;""",
    """            var capVal = (document.getElementById('org-edit-cap')?.value || '').trim();
            org.maxPlayers = capVal === '' ? Infinity : (parseInt(capVal, 10) || 0);
            var cohortsCapVal = (document.getElementById('org-edit-max-cohorts')?.value || '').trim();
            org.maxCohorts = cohortsCapVal === '' ? Infinity : (parseInt(cohortsCapVal, 10) || 0);
            org.active = !!document.getElementById('org-edit-active')?.checked;

            // Rate Card plan features (auto-filled by tier, manually overridable)
            document.querySelectorAll('#pflx-org-editor-modal input[data-plan-feat]').forEach(function (cb) {
                org[cb.getAttribute('data-plan-feat')] = !!cb.checked;
            });
            org.hostCertifiedStaff = parseInt(document.getElementById('org-edit-host-staff')?.value, 10) || 0;
            org.namedPointOfContact = (document.getElementById('org-edit-poc')?.value || '').trim() || null;

            // Logo — hidden input carries the resized data URI (empty = no logo / removed)
            var logoVal = (document.getElementById('org-edit-logo-data')?.value || '').trim();
            org.logo = logoVal || null;""",
)

# ─── 8. hmcAddOrg — new-org tier dropdown + seeded fields ──────────────────
apply(
    "hmc-org-new-sub select options",
    """                                        <select id="hmc-org-new-sub" style="background:rgba(10,18,40,0.6);border:1px solid rgba(0,240,255,0.12);color:#e0e6ff;padding:8px 12px;border-radius:6px;font-family:'Rajdhani',sans-serif;">
                                            <option value="free">Free</option>
                                            <option value="standard">Standard</option>
                                            <option value="premium">Premium</option>
                                            <option value="enterprise" selected>Enterprise</option>
                                        </select>""",
    """                                        <select id="hmc-org-new-sub" style="background:rgba(10,18,40,0.6);border:1px solid rgba(0,240,255,0.12);color:#e0e6ff;padding:8px 12px;border-radius:6px;font-family:'Rajdhani',sans-serif;">
                                            <option value="free">Independent (Free)</option>
                                            <option value="essential" selected>Org Essential</option>
                                            <option value="plus">Org Plus</option>
                                            <option value="campus">Org Campus</option>
                                            <option value="enterprise">Org Enterprise</option>
                                        </select>""",
)

apply(
    "hmcAddOrg body — seed Rate Card defaults",
    """        function hmcAddOrg() {
            const name = document.getElementById('hmc-org-new-name').value.trim();
            const short = document.getElementById('hmc-org-new-short').value.trim().toUpperCase();
            const contact = document.getElementById('hmc-org-new-contact').value.trim();
            const sub = document.getElementById('hmc-org-new-sub').value;
            if (!name || !short) { alert('Organization name and short name are required.'); return; }
            if (ORGANIZATIONS[short]) { alert('An organization with that short name already exists.'); return; }
            ORGANIZATIONS[short] = {
                name, shortName: short, subscription: sub, contact: contact || null,
                cohorts: [], maxPlayers: sub === 'enterprise' ? 500 : sub === 'premium' ? 200 : 50, active: true
            };""",
    """        function hmcAddOrg() {
            const name = document.getElementById('hmc-org-new-name').value.trim();
            const short = document.getElementById('hmc-org-new-short').value.trim().toUpperCase();
            const contact = document.getElementById('hmc-org-new-contact').value.trim();
            const sub = document.getElementById('hmc-org-new-sub').value;
            if (!name || !short) { alert('Organization name and short name are required.'); return; }
            if (ORGANIZATIONS[short]) { alert('An organization with that short name already exists.'); return; }
            var tierMeta = ORG_TIER_META[sub] || null;
            var tierFlags = (tierMeta && tierMeta.flags) || {};
            ORGANIZATIONS[short] = Object.assign({
                name, shortName: short, subscription: sub, contact: contact || null,
                cohorts: [], logo: null,
                maxPlayers: tierMeta && tierMeta.maxPlayers !== null ? tierMeta.maxPlayers : Infinity,
                maxCohorts: tierMeta && tierMeta.maxCohorts !== null ? tierMeta.maxCohorts : Infinity,
                active: true
            }, tierFlags);""",
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('ALL PATCHES APPLIED')
