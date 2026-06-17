function AdminPanel() {
  const [adminTab, setAdminTab] = useState('אישורים');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportContent, setReportContent] = useState('');
  const [reportImage, setReportImage] = useState(null);
  const [reportPreview, setReportPreview] = useState(null);
  const [reports, setReports] = useState([]);
  const [tradingOpen, setTradingOpen] = useState(false);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [storeTitle, setStoreTitle] = useState('');
  const [storeDesc, setStoreDesc] = useState('');
  const [storePrice, setStorePrice] = useState('');
  const [storeImage, setStoreImage] = useState(null);
  const [storePreview, setStorePreview] = useState(null);
  const [storeItems, setStoreItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newBalance, setNewBalance] = useState('');
  const [orders, setOrders] = useState([]);
  const reportFileRef = useRef();
  const storeFileRef = useRef();

  const showMsg = (text, isError = false) => {
    setMsg({ text, isError });
    setTimeout(() => setMsg(null), 3000);
  };

  const loadAll = async () => {
    try {
      const [reps, store, usrs, ords, settings] = await Promise.all([
        sb('reports?order=created_at.desc&limit=20'),
        sb('store_items?order=price.asc'),
        sb('users?order=created_at.desc'),
        sb('orders?order=created_at.desc&limit=30'),
        sb('trading_settings?limit=1'),
      ]);
      setReports(reps);
      setStoreItems(store);
      setUsers(usrs);
      setOrders(ords);
      if (settings[0]) {
        setTradingOpen(settings[0].is_open);
        setOpenTime(settings[0].open_time || '09:00');
        setCloseTime(settings[0].close_time || '17:00');
      }
    } catch (e) {
      showMsg('שגיאה בטעינה', true);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSendReport = async () => {
    if (!reportContent.trim()) { showMsg('חסר תוכן', true); return; }
    setLoading(true);
    try {
      let imageUrl = null;
      if (reportImage) imageUrl = await uploadImage(reportImage);
      await sb('reports', { method: 'POST', body: JSON.stringify({ title: reportTitle.trim(), content: reportContent.trim(), image_url: imageUrl }) });
      setReportTitle(''); setReportContent(''); setReportImage(null); setReportPreview(null);
      if (reportFileRef.current) reportFileRef.current.value = '';
      showMsg('הדיווח נשלח ✅');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה: ' + e.message, true);
    }
    setLoading(false);
  };

  const handleToggleTrading = async () => {
    setLoading(true);
    try {
      const newState = !tradingOpen;
      const existing = await sb('trading_settings?limit=1');
      if (existing.length === 0) {
        await sb('trading_settings', { method: 'POST', body: JSON.stringify({ is_open: newState, open_time: openTime, close_time: closeTime }) });
      } else {
        await sb(`trading_settings?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ is_open: newState }) });
      }
      setTradingOpen(newState);
      showMsg(newState ? '🟢 המסחר נפתח!' : '🔴 המסחר נסגר!');
    } catch (e) {
      showMsg('שגיאה', true);
    }
    setLoading(false);
  };

  const handleSaveHours = async () => {
    setLoading(true);
    try {
      const existing = await sb('trading_settings?limit=1');
      if (existing.length === 0) {
        await sb('trading_settings', { method: 'POST', body: JSON.stringify({ is_open: tradingOpen, open_time: openTime, close_time: closeTime }) });
      } else {
        await sb(`trading_settings?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ open_time: openTime, close_time: closeTime }) });
      }
      showMsg('שעות נשמרו ✅');
    } catch (e) {
      showMsg('שגיאה', true);
    }
    setLoading(false);
  };

  const handleAddStoreItem = async () => {
    if (!storeTitle.trim() || !storePrice) { showMsg('חסרים פרטים', true); return; }
    setLoading(true);
    try {
      let imageUrl = null;
      if (storeImage) imageUrl = await uploadImage(storeImage);
      await sb('store_items', { method: 'POST', body: JSON.stringify({ title: storeTitle.trim(), description: storeDesc.trim(), price: parseFloat(storePrice), image_url: imageUrl, is_unlocked: false }) });
      setStoreTitle(''); setStoreDesc(''); setStorePrice(''); setStoreImage(null); setStorePreview(null);
      if (storeFileRef.current) storeFileRef.current.value = '';
      showMsg('נוסף לחנות ✅');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה: ' + e.message, true);
    }
    setLoading(false);
  };

  const handleUpdateBalance = async (userId) => {
    if (!newBalance) return;
    try {
      await sb(`users?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ balance: parseFloat(newBalance) }) });
      showMsg('יתרה עודכנה ✅');
      setSelectedUser(null);
      setNewBalance('');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה', true);
    }
  };

  const handleCancelOrder = async (id) => {
    try {
      const ordersList = await sb(`orders?id=eq.${id}`);
      const order = ordersList[0];
      if (!order || order.status !== 'open') { showMsg('הפקודה אינה פתוחה', true); return; }

      if (order.type === 'buy') {
        const usersList = await sb(`users?id=eq.${order.user_id}`);
        if (usersList[0]) {
          await sb(`users?id=eq.${order.user_id}`, { method: 'PATCH', body: JSON.stringify({ balance: usersList[0].balance + (order.quantity * order.price) }) });
        }
      } else {
        const holdingsList = await sb(`holdings?user_id=eq.${order.user_id}`);
        if (holdingsList[0]) {
          await sb(`holdings?user_id=eq.${order.user_id}`, { method: 'PATCH', body: JSON.stringify({ quantity: holdingsList[0].quantity + order.quantity }) });
        }
      }

      await sb(`orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      showMsg('הפקודה בוטלה והמזומן/מניות הוחזרו ✅');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה: ' + e.message, true);
    }
  };

  const handleApproveUser = async (userId) => {
    try {
      await sb(`users?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
      showMsg('המשתמש אושר ✅');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה', true);
    }
  };

  const handleRejectUser = async (userId) => {
    try {
      await sb(`users?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
      showMsg('המשתמש נדחה');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה', true);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await sb(`holdings?user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' });
      await sb(`orders?user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' });
      await sb(`chat_messages?user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' });
      await sb(`store_purchases?user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' });
      await sb(`users?id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' });
      showMsg('המשתמש נמחק');
      await loadAll();
    } catch (e) {
      showMsg('שגיאה: ' + e.message, true);
    }
  };

  const st = {
    inp: { width: '100%', background: '#0a0e17', border: '1px solid #1e2535', borderRadius: 8, padding: '12px 14px', color: '#fff', fontSize: 14, outline: 'none', marginBottom: 10 },
    card: { background: '#111827', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #1e2535' },
    lbl: { fontSize: 10, letterSpacing: 2, color: '#5c6480', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', display: 'block' },
    btn: (c, full) => ({ padding: full ? '13px 0' : '10px 18px', width: full ? '100%' : 'auto', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', background: c || '#4f7cff', color: (c === '#ff4d6d' || c === '#00c896') ? '#000' : '#fff' }),
    msg: (e) => ({ background: e ? '#ff4d6d20' : '#00c89620', border: `1px solid ${e ? '#ff4d6d' : '#00c896'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: e ? '#ff4d6d' : '#00c896', fontWeight: 600 }),
    upload: { border: '2px dashed #1e2535', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer', marginBottom: 10, color: '#5c6480', fontSize: 13 },
    badge: (v) => ({ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: v ? '#00c89620' : '#ff4d6d20', color: v ? '#00c896' : '#ff4d6d' }),
  };

  return (
    <div style={{ background: '#0a0e17', minHeight: '100vh', color: '#e8eaf0', direction: 'rtl', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #1e2535' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: '#5c6480', marginBottom: 4 }}>KDM EXCHANGE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>פאנל ניהול</div>
          </div>
          <div style={st.badge(tradingOpen)}>{tradingOpen ? 'מסחר פעיל' : 'מסחר סגור'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1e2535', background: '#0a0e17', overflowX: 'auto' }}>
        {ADMIN_TABS.map(t => (
          <button key={t} onClick={() => setAdminTab(t)} style={{ flex: 1, minWidth: 80, padding: '13px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'transparent', color: adminTab === t ? '#fff' : '#5c6480', borderBottom: adminTab === t ? '2px solid #4f7cff' : '2px solid transparent', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {msg && <div style={st.msg(msg.isError)}>{msg.isError ? '⚠️ ' : '✓ '}{msg.text}</div>}

        {adminTab === 'אישורים' && (
          <div>
            <span style={st.lbl}>בקשות ממתינות ({users.filter(u => !u.is_admin && u.status === 'pending').length})</span>
            {users.filter(u => !u.is_admin && u.status === 'pending').length === 0 && (
              <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 24 }}>אין בקשות ממתינות</div>
            )}
            {users.filter(u => !u.is_admin && u.status === 'pending').map((u, i) => (
              <div key={i} style={st.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: '#5c6480', marginTop: 2 }}>{new Date(u.created_at).toLocaleString('he-IL')}</div>
                  </div>
                  <span style={st.badge(false)}>ממתין</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={st.btn('#00c896', true)} onClick={() => handleApproveUser(u.id)}>✓ אשר</button>
                  <button style={{ ...st.btn(true), background: '#1e2535', color: '#ff4d6d' }} onClick={() => handleRejectUser(u.id)}>✕ דחה</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'דיווחים' && (
          <div>
            <div style={st.card}>
              <span style={st.lbl}>שלח דיווח חדש</span>
              <input style={st.inp} placeholder="כותרת (אופציונלי)" value={reportTitle} onChange={e => setReportTitle(e.target.value)}/>
              <textarea style={{ ...st.inp, minHeight: 100, resize: 'vertical' }} placeholder="תוכן הדיווח..." value={reportContent} onChange={e => setReportContent(e.target.value)}/>
              {reportPreview
                ? <div style={{ position: 'relative', marginBottom: 10 }}>
                    <img src={reportPreview} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }}/>
                    <button onClick={() => { setReportImage(null); setReportPreview(null); if (reportFileRef.current) reportFileRef.current.value = ''; }} style={{ position: 'absolute', top: 8, left: 8, background: '#ff4d6d', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>הסר</button>
                  </div>
                : <div style={st.upload} onClick={() => reportFileRef.current?.click()}>
                    📷 הוסף תמונה (אופציונלי)
                    <input ref={reportFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setReportImage(f); setReportPreview(URL.createObjectURL(f)); } }}/>
                  </div>
              }
              <button style={st.btn('#00c896', true)} onClick={handleSendReport} disabled={loading}>{loading ? 'שולח...' : '📢 שלח דיווח לכולם'}</button>
            </div>
            <span style={st.lbl}>דיווחים קיימים ({reports.length})</span>
            {reports.map((r, i) => (
              <div key={i} style={st.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#5c6480' }}>{new Date(r.created_at).toLocaleString('he-IL')}</div>
                  <button onClick={async () => { await sb(`reports?id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' }); loadAll(); }} style={{ background: 'none', border: 'none', color: '#ff4d6d', cursor: 'pointer', fontSize: 12 }}>מחק</button>
                </div>
                {r.title && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{r.title}</div>}
                <div style={{ fontSize: 13, color: '#c8ccd8', lineHeight: 1.6 }}>{r.content}</div>
                {r.image_url && <img src={r.image_url} style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 180, objectFit: 'cover' }}/>}
              </div>
            ))}
          </div>
        )}

        {adminTab === 'שעות מסחר' && (
          <div>
            <div style={st.card}>
              <span style={st.lbl}>סטטוס מסחר</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: tradingOpen ? '#00c896' : '#ff4d6d' }}>{tradingOpen ? '🟢 המסחר פתוח' : '🔴 המסחר סגור'}</div>
                <button style={{ ...st.btn(tradingOpen ? '#ff4d6d' : '#00c896'), padding: '14px 24px' }} onClick={handleToggleTrading} disabled={loading}>{tradingOpen ? 'סגור' : 'פתח'}</button>
              </div>
            </div>
            <div style={st.card}>
              <span style={st.lbl}>שעות קבועות</span>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#5c6480', marginBottom: 6 }}>פתיחה</div>
                  <input style={{ ...st.inp, marginBottom: 0 }} type="time" value={openTime} onChange={e => setOpenTime(e.target.value)}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#5c6480', marginBottom: 6 }}>סגירה</div>
                  <input style={{ ...st.inp, marginBottom: 0 }} type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}/>
                </div>
              </div>
              <button style={st.btn('#4f7cff', true)} onClick={handleSaveHours} disabled={loading}>שמור שעות</button>
            </div>
          </div>
        )}

        {adminTab === 'חנות' && (
          <div>
            <div style={st.card}>
              <span style={st.lbl}>הוסף פריט</span>
              <input style={st.inp} placeholder="שם התמונה" value={storeTitle} onChange={e => setStoreTitle(e.target.value)}/>
              <input style={st.inp} placeholder="תיאור" value={storeDesc} onChange={e => setStoreDesc(e.target.value)}/>
              <input style={st.inp} type="number" placeholder="מחיר ($)" value={storePrice} onChange={e => setStorePrice(e.target.value)}/>
              {storePreview
                ? <div style={{ position: 'relative', marginBottom: 10 }}>
                    <img src={storePreview} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }}/>
                    <button onClick={() => { setStoreImage(null); setStorePreview(null); if (storeFileRef.current) storeFileRef.current.value = ''; }} style={{ position: 'absolute', top: 8, left: 8, background: '#ff4d6d', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>הסר</button>
                  </div>
                : <div style={st.upload} onClick={() => storeFileRef.current?.click()}>
                    🔒 העלה תמונה חסויה
                    <input ref={storeFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setStoreImage(f); setStorePreview(URL.createObjectURL(f)); } }}/>
                  </div>
              }
              <button style={st.btn('#4f7cff', true)} onClick={handleAddStoreItem} disabled={loading}>{loading ? 'מוסיף...' : '➕ הוסף לחנות'}</button>
            </div>
            {storeItems.map((item, i) => (
              <div key={i} style={st.card}>
                {item.image_url && <img src={item.image_url} style={{ width: '100%', borderRadius: 8, marginBottom: 10, maxHeight: 150, objectFit: 'cover', filter: 'blur(6px)' }}/>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#5c6480' }}>{item.description} · <span style={{ color: '#4f7cff', fontWeight: 700 }}>${item.price}</span></div>
                  </div>
                  <button onClick={async () => { await sb(`store_purchases?item_id=eq.${item.id}`, { method: 'DELETE', prefer: 'return=minimal' }); await sb(`store_items?id=eq.${item.id}`, { method: 'DELETE', prefer: 'return=minimal' }); loadAll(); }} style={{ background: 'none', border: '1px solid #ff4d6d', borderRadius: 6, padding: '6px 12px', color: '#ff4d6d', cursor: 'pointer', fontSize: 12 }}>מחק</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'משתמשים' && (
          <div>
            <span style={st.lbl}>משתמשים מאושרים ({users.filter(u => !u.is_admin && u.status === 'approved').length})</span>
            {users.filter(u => !u.is_admin && u.status === 'approved').map((u, i) => (
              <div key={i} style={st.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: '#5c6480', marginTop: 2 }}>{new Date(u.created_at).toLocaleDateString('he-IL')}</div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>${(u.balance || 0).toFixed(2)}</div>
                    <button onClick={() => { setSelectedUser(u); setNewBalance(u.balance); }} style={{ background: 'none', border: 'none', color: '#4f7cff', cursor: 'pointer', fontSize: 12 }}>ערוך יתרה</button>
                  </div>
                </div>
                {selectedUser?.id === u.id && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <input style={{ ...st.inp, flex: 1, marginBottom: 0 }} type="number" placeholder="יתרה חדשה" value={newBalance} onChange={e => setNewBalance(e.target.value)}/>
                    <button style={st.btn('#00c896')} onClick={() => handleUpdateBalance(u.id)}>שמור</button>
                    <button onClick={() => setSelectedUser(null)} style={{ ...st.btn(), background: '#1e2535', color: '#9aa0b8' }}>ביטול</button>
                  </div>
                )}
                <button onClick={() => { if (confirm(`למחוק את ${u.username}? פעולה זו תמחק גם את כל הנתונים שלו ולא ניתן לבטל אותה.`)) handleDeleteUser(u.id); }} style={{ marginTop: 10, background: 'none', border: '1px solid #ff4d6d', borderRadius: 6, padding: '6px 12px', color: '#ff4d6d', cursor: 'pointer', fontSize: 12, width: '100%' }}>🗑️ מחק משתמש</button>
              </div>
            ))}

            {users.filter(u => !u.is_admin && u.status === 'rejected').length > 0 && (
              <div>
                <span style={st.lbl}>משתמשים שנדחו ({users.filter(u => !u.is_admin && u.status === 'rejected').length})</span>
                {users.filter(u => !u.is_admin && u.status === 'rejected').map((u, i) => (
                  <div key={i} style={st.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#5c6480' }}>{u.username}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleApproveUser(u.id)} style={{ background: 'none', border: '1px solid #00c896', borderRadius: 6, padding: '6px 12px', color: '#00c896', cursor: 'pointer', fontSize: 12 }}>אשר בכל זאת</button>
                        <button onClick={() => { if (confirm(`למחוק את ${u.username}?`)) handleDeleteUser(u.id); }} style={{ background: 'none', border: '1px solid #ff4d6d', borderRadius: 6, padding: '6px 12px', color: '#ff4d6d', cursor: 'pointer', fontSize: 12 }}>מחק</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {adminTab === 'פקודות' && (
          <div>
            <span style={st.lbl}>כל הפקודות ({orders.length})</span>
            {orders.map((o, i) => (
              <div key={i} style={st.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: o.type === 'buy' ? '#00c89620' : '#ff4d6d20', color: o.type === 'buy' ? '#00c896' : '#ff4d6d' }}>{o.type === 'buy' ? 'קנייה' : 'מכירה'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: o.status === 'open' ? '#4f7cff20' : '#1e2535', color: o.status === 'open' ? '#4f7cff' : '#5c6480' }}>{o.status === 'open' ? 'פתוחה' : o.status === 'cancelled' ? 'בוטלה' : 'בוצעה'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#9aa0b8' }}>{o.quantity} מניות · ${parseFloat(o.price).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: '#5c6480', marginTop: 4 }}>{new Date(o.created_at).toLocaleString('he-IL')}</div>
                  </div>
                  {o.status === 'open' && (
                    <button onClick={() => handleCancelOrder(o.id)} style={{ background: 'none', border: '1px solid #ff4d6d', borderRadius: 6, padding: '6px 12px', color: '#ff4d6d', cursor: 'pointer', fontSize: 12 }}>בטל</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
