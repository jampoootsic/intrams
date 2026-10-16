import { useEffect, useState } from 'react';
import { candidates as candidatesApi, teams as teamsApi, segmentsApi } from '../api.js';

const EMPTY = { candidate_no: '', first_name: '', last_name: '', gender: 'Male', group_name: '', active: true, team_id: '' };

export default function CandidatesTab({ competition }) {
  const [list, setList] = useState([]);
  const [teamList, setTeamList] = useState([]);
  const [modal, setModal] = useState(null); // { id?: number } -> editing
  const [form, setForm] = useState(EMPTY);
  const [photoFile, setPhotoFile] = useState(null); // File selected for upload
  const [photoPreview, setPhotoPreview] = useState(''); // data URL for preview
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [segments, setSegments] = useState([]); // exposures for the per-segment photo picker
  const [photoSegId, setPhotoSegId] = useState(null); // currently selected exposure
  const [segPhotos, setSegPhotos] = useState({}); // { [segmentId]: { existing, file, fileUrl } }

  const compId = competition ? competition.id : null;
  // Standalone competitions: Hiphop manages dance GROUPS (no gender, one per team);
  // Solo Singing manages individual soloists. Pageant keeps male/female candidates.
  const isStandalone = !!(competition && Number(competition.standalone) === 1);
  const isGroup = isStandalone && competition.unit_type === 'group';

  const load = async () => {
    try {
      const [cs, ts, sgs] = await Promise.all([
        candidatesApi.list(compId),
        teamsApi.list(compId),
        segmentsApi.list(compId),
      ]);
      setList(cs);
      setTeamList(ts);
      setSegments(sgs);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, [competition]);

  const nextNumber = () => {
    const nums = list.map((c) => parseInt(c.candidate_no, 10)).filter((n) => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return String(next).padStart(2, '0');
  };

  const openAdd = () => {
    setForm({ ...EMPTY, candidate_no: nextNumber() });
    setModal({});
    setPhotoFile(null);
    setPhotoPreview('');
    setSegPhotos({});
    setPhotoSegId(segments.length ? String(segments[0].id) : null);
    setError('');
  };

  const openEdit = (c) => {
    setForm({
      candidate_no: c.candidate_no,
      first_name: c.first_name,
      last_name: c.last_name,
      gender: c.gender,
      group_name: c.group_name || '',
      active: !!c.active,
      team_id: c.team_id || '',
    });
    setModal({ id: c.id, photo_url: c.photo_url || null });
    setPhotoFile(null);
    setPhotoPreview('');
    const sp = {};
    Object.entries(c.segment_photos || {}).forEach(([sid, p]) => {
      sp[sid] = { existing: p.photo_url, file: null, fileUrl: null };
    });
    setSegPhotos(sp);
    setPhotoSegId(Object.keys(sp)[0] || (segments.length ? String(segments[0].id) : null));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isGroup && !form.team_id) {
      setError('A team is required for a hiphop group — one group per team.');
      return;
    }
    try {
      let createdId = null;
      if (modal.id) {
        await candidatesApi.update(modal.id, form);
      } else {
        const r = await candidatesApi.create({ ...form, competition_id: compId });
        createdId = r.id;
      }
      const id = modal.id || createdId;
      await uploadSelectedPhoto(id); // attaches main photo if a file was chosen
      await uploadSegmentPhotos(id); // attaches per-exposure photos
      setModal(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15 MB, must match server limit

  const onPickPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    // Check size before letting the user attach it.
    if (f.size > MAX_PHOTO_SIZE) {
      window.alert(
        `Photo is too large (${(f.size / (1024 * 1024)).toFixed(1)} MB).\n\nMaximum allowed size is 15 MB.\nPlease choose a smaller photo.`
      );
      e.target.value = '';
      return;
    }

    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setError('');
  };

  const uploadSelectedPhoto = async (id) => {
    if (!id || !photoFile) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', photoFile);
      await candidatesApi.uploadPhoto(id, fd);
      setError('');
    } catch (err) {
      setError(err.message);
      window.alert(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPickSegmentPhoto = (e, segId) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    // Check size before letting the user attach it.
    if (f.size > MAX_PHOTO_SIZE) {
      window.alert(
        `Photo is too large (${(f.size / (1024 * 1024)).toFixed(1)} MB).\n\nMaximum allowed size is 15 MB.\nPlease choose a smaller photo.`
      );
      e.target.value = '';
      return;
    }

    const prev = segPhotos[segId] || {};
    setSegPhotos({ ...segPhotos, [segId]: { existing: prev.existing, file: f, fileUrl: URL.createObjectURL(f) } });
    setError('');
  };

  const removeSegmentPhoto = async (segId) => {
    const entry = segPhotos[segId];
    if (!entry) return;
    // Delete from the server first when this exposure already had a saved photo.
    if (entry.existing && modal.id) {
      try {
        await candidatesApi.removePhoto(modal.id, Number(segId));
        setError('');
      } catch (err) {
        setError(err.message);
        window.alert(err.message);
        return;
      }
    }
    setSegPhotos({ ...segPhotos, [segId]: { existing: null, file: null, fileUrl: null } });
  };

  const uploadSegmentPhotos = async (id) => {
    if (!id) return;
    for (const [segId, entry] of Object.entries(segPhotos)) {
      if (!entry || !entry.file) continue;
      setPhotoBusy(true);
      try {
        const fd = new FormData();
        fd.append('photo', entry.file);
        await candidatesApi.uploadPhoto(id, fd, Number(segId));
        setError('');
      } catch (err) {
        setError(err.message);
        window.alert(err.message);
      } finally {
        setPhotoBusy(false);
      }
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete candidate ${c.candidate_no} (${c.first_name} ${c.last_name})? This also deletes their scores and photo.`)) return;
    try {
      await candidatesApi.remove(c.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removePhoto = async (c) => {
    if (!window.confirm(`Remove photo for ${c.first_name} ${c.last_name}?`)) return;
    try {
      await candidatesApi.removePhoto(c.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (c) => {
    try {
      await candidatesApi.update(c.id, {
        candidate_no: c.candidate_no,
        first_name: c.first_name,
        last_name: c.last_name,
        gender: c.gender,
        group_name: c.group_name || '',
        team_id: c.team_id || '',
        active: c.active ? 0 : 1,
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="results-head">
        <h2>{isGroup ? 'Manage Groups' : isStandalone ? 'Manage Contestants' : 'Manage Candidates'}</h2>
        {competition && <div className="results-subtitle">{competition.name}</div>}
        <button className="btn primary" onClick={openAdd}>{isGroup ? '+ Add Group' : isStandalone ? '+ Add Contestant' : '+ Add Candidate'}</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="sheet-card">
        <table className="grid simple">
          <thead>
            <tr>
              <th>Photo</th>
              <th>#</th>
              <th>Candidate Number</th>
              {isGroup ? <th>Group Name</th> : isStandalone ? (<><th>First Name</th><th>Last Name</th></>) : (<><th>First Name</th><th>Last Name</th><th>Gender</th></>)}
              <th>Team</th>
              <th>Active</th>
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={!c.active ? 'inactive' : ''}>
                <td className="center">
                  <div className="photo-cell">
                    {c.photo_url ? (
                      <>
                        <img className="thumb" src={c.photo_url} alt={c.first_name} />
                        <button className="thumb-remove" title="Remove photo" onClick={() => removePhoto(c)}>✕</button>
                      </>
                    ) : (
                      <span className="thumb empty">—</span>
                    )}
                    {Object.keys(c.segment_photos || {}).length > 0 && (
                      <span
                        className="seg-dots"
                        title={`${Object.keys(c.segment_photos).length} exposure photo(s)`}
                      >
                        {Object.keys(c.segment_photos).length}
                      </span>
                    )}
                  </div>
                </td>
                <td className="center">{c.id}</td>
                <td>{c.candidate_no}</td>
                {isGroup ? (
                  <td><strong>{c.group_name || '—'}</strong></td>
                ) : isStandalone ? (
                  <>
                    <td>{c.first_name}</td>
                    <td>{c.last_name}</td>
                  </>
                ) : (
                  <>
                    <td>{c.first_name}</td>
                    <td>{c.last_name}</td>
                    <td><span className={`badge ${c.gender === 'Male' ? 'm' : 'f'}`}>{c.gender}</span></td>
                  </>
                )}
                <td>
                  {c.team_name ? (
                    <span className="team-badge" style={{ '--tcolor': c.team_color || '#14213d' }}>
                      <span className="team-dot" style={{ background: c.team_color || '#14213d' }} />
                      {c.team_name}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <button className={`toggle ${c.active ? 'on' : ''}`} onClick={() => toggle(c)}>
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="actions">
                  <button className="btn small" onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn small danger" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={isGroup ? 7 : isStandalone ? 8 : 9} className="empty-state">
                {isGroup ? 'No groups yet. Add a group and assign it to a team (one group per team).' : isStandalone ? 'No contestants yet. Click “Add Contestant”.' : 'No candidates yet. Click “Add Candidate”.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <form className="modal cand-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="modal-head">
              <div className="modal-head-title">
                <h3>{modal.id ? 'Edit Candidate' : 'Add Candidate'}</h3>
                <p>{modal.id ? 'Update details, main photo and exposure photos.' : 'Register a new candidate for scoring & results.'}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close">✕</button>
            </div>

            <section className="modal-section">
              <div className="modal-section-title">
                <span className="step">1</span>
                <strong>Candidate Details</strong>
                <small>Name, gender, team &amp; status</small>
              </div>
            <div className="form-grid">
              <label className="field">
                <span>Candidate Number</span>
                <input value={form.candidate_no} onChange={(e) => setForm({ ...form, candidate_no: e.target.value })} required />
              </label>
              {isGroup ? (
                <>
                  <label className="field">
                    <span>Group Name</span>
                    <input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Team <em className="opt">(one group per team)</em></span>
                    <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} required>
                      <option value="">— Select team —</option>
                      {teamList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : isStandalone ? (
                <>
                  <label className="field">
                    <span>First Name</span>
                    <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Last Name</span>
                    <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Team <em className="opt">(optional)</em></span>
                    <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                      <option value="">— No team —</option>
                      {teamList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Gender</span>
                    <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Team</span>
                    <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                      <option value="">— No team —</option>
                      {teamList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>First Name</span>
                    <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Last Name</span>
                    <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
                  </label>
                </>
              )}
              <label className="switch-field">
                <span className="switch-label">{isGroup ? 'Active group' : isStandalone ? 'Active contestant' : 'Active candidate'}</span>
                <span className="switch">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  <span className="slider" />
                </span>
                <em>Shown in scoring</em>
              </label>
            </div>

            </section>

            <section className="modal-section">
              <div className="modal-section-title">
                <span className="step">2</span>
                <strong>Main Photo</strong>
                <small>Faces photo — used when no exposure photo is set</small>
              </div>
              <div className="photo-upload">
              <div className="photo-preview">
                {photoPreview ? (
                  <img className="thumb lg" src={photoPreview} alt="preview" />
                ) : modal.photo_url ? (
                  <img className="thumb lg" src={modal.photo_url} alt="current" />
                ) : (
                  <span className="thumb empty lg">No photo</span>
                )}
              </div>
              <div className="photo-upload-controls">
                <span>Candidate photo</span>
                <small>JPG, PNG, GIF, WEBP, HEIC or BMP · max 15 MB</small>
                <div>
                  <label className="btn">
                    {photoFile ? 'Change photo' : 'Choose photo'}
                    <input type="file" accept="image/*" onChange={onPickPhoto} hidden />
                  </label>
                  {photoFile && <span className="photo-name">{photoFile.name}</span>}
                </div>
              </div>
            </div>
            </section>

            <section className="modal-section">
              <div className="modal-section-title">
                <span className="step">3</span>
                <strong>Exposure Photos</strong>
                <small>Give each segment its own photo — used in scoring &amp; results</small>
              </div>
              {segments.length === 0 ? (
                <span className="muted">No exposures available.</span>
              ) : (
                <div className="seg-photo-tabs">
                  {segments.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`seg-photo-tab ${photoSegId === String(s.id) ? 'on' : ''}`}
                      onClick={() => setPhotoSegId(String(s.id))}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {photoSegId && (
                <div className="seg-photo-edit">
                  <div className="photo-preview">
                    {(segPhotos[photoSegId]?.fileUrl || segPhotos[photoSegId]?.existing) ? (
                      <img
                        className="thumb lg"
                        src={segPhotos[photoSegId].fileUrl || segPhotos[photoSegId].existing}
                        alt="exposure preview"
                      />
                    ) : (
                      <span className="thumb empty lg">No photo</span>
                    )}
                  </div>
                  <div className="photo-upload-controls">
                    <span>{segments.find((s) => String(s.id) === photoSegId)?.name}</span>
                    <small>
                      {segPhotos[photoSegId]?.existing
                        ? 'Has a photo — choose a file to replace it.'
                        : 'No photo for this exposure yet.'}
                    </small>
                    <div>
                      <label className="btn">
                        {segPhotos[photoSegId]?.file ? 'Change photo' : 'Choose photo'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => onPickSegmentPhoto(e, photoSegId)}
                        />
                      </label>
                      {segPhotos[photoSegId]?.file && <span className="photo-name">{segPhotos[photoSegId].file.name}</span>}
                      {(segPhotos[photoSegId]?.file || segPhotos[photoSegId]?.existing) && (
                        <button type="button" className="btn small danger" onClick={() => removeSegmentPhoto(photoSegId)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {photoBusy && <div className="alert ok">Uploading photo…</div>}

            <div className="modal-actions">
              <span className="modal-hint">Photos are attached when you save</span>
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn primary">{modal.id ? 'Save Changes' : 'Add Candidate'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}