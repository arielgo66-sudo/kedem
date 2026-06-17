function App() {
  const [screen, setScreen] = useState('checking'); // checking | login | pending | app | admin
  const [username, setUsername] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('מסחר');
  const [priceHistory, setPriceHistory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [storeItems, setStoreItems] = useState([]);
  const [myPurchases, setMyPurchases] = useState([]);
  const [trades, setTrades] = useState([]);
  const [allHoldings, setAllHoldings] = useState([]);
  const [allPurchases, setAllPurchases] = useState([]);
  const [tradeAlert, setTradeAlert] = useState(null);
  const seenTradeIds = useRef(new Set());
  const firstLoadDone = useRef(false);
  const [holding, setHolding] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [tradingOpen, setTradingOpen] = useState(false);
  const [tradingHours, setTradingHours] = useState({ open: '09:00', close: '17:00' });
  const [orderType, setOrderType] = useState('קנייה');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('12');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const chatEndRef = useRef(null);

  const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : 100;
  const openPrice = priceHistory.length > 0 ? priceHistory[0].price : 100;
  const priceChange = currentPrice - openPrice;
  const priceChangePct = ((priceChange / openPrice) * 100).toFixed(2);
  const isUp = priceChange >= 0;

  const showMsg = (text, isError = false) => { setMsg({ text, isError }); setTimeout(() => setMsg(null), 4000); };

  const loadData = async () => {
    try {
      const [prices, openOrders, chat, reps, store, usrs, settings, allTrades, holdings, purchases] = await Promise.all([
        sb('price_history?order=recorded_at.asc&limit=50'),
        sb('orders?order=created_at.desc&limit=100'),
        sb('chat_messages?order=created_at.asc&limit=50'),
        sb('reports?order=created_at.desc&limit=10'),
        sb('store_items?order=price.asc'),
        sb('users?order=username.asc'),
        sb('trading_settings?limit=1'),
        sb('trades?order=executed_at.desc&limit=100'),
        sb('holdings'),
        sb('store_purchases'),
      ]);
      setPriceHistory(prices);
      setOrders(openOrders);
      setChatMessages(chat);
      setReports(reps);
      setStoreItems(store);
      setAllUsers(usrs.filter(u => !u.is_admin));
      if (settings[0]) {
        setTradingOpen(settings[0].is_open);
        setTradingHours({ open: settings[0].open_time || '09:00', close: settings[0].close_time || '17:00' });
      }
      setTrades(allTrades);
      setAllHoldings(holdings);
      setAllPurchases(purchases);
    } catch (e) { console.error(e); }
  };

  const loadUserData = async (userId) => {
    try {
      const [holdings, users, purchases] = await Promise.all([
        sb(`holdings?user_id=eq.${userId}`),
        sb(`users?id=eq.${userId}`),
        sb(`store_purchases?user_id=eq.${userId}`),
      ]);
      setHolding(holdings[0] || { quantity: 0, avg_buy_price: 0 });
      if (users[0]) setCurrentUser(users[0]);
      setMyPurchases(purchases.map(p => p.item_id));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (screen === 'app') {
      loadData();
      const i = setInterval(loadData, 5000);
      return () => clearInterval(i);
    }
  }, [screen]);

  useEffect(() => {
    const tryAutoLogin = async () => {
      const savedUsername = localStorage.getItem('kdm_username');
      if (!savedUsername) { setScreen('login'); return; }
      try {
        const users = await sb(`users?username=eq.${encodeURIComponent(savedUsername)}&is_admin=eq.false`);
        if (users.length === 0) { localStorage.removeItem('kdm_username'); setScreen('login'); return; }
        const user = users[0];
        if (user.status === 'pending') { setCurrentUser(user); setScreen('pending'); return; }
        if (user.status === 'rejected') { localStorage.removeItem('kdm_username'); setScreen('login'); return; }
        setCurrentUser(user);
        setScreen('app');
        await loadUserData(user.id);
      } catch (e) {
        setScreen('login');
      }
    };
    tryAutoLogin();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (!currentUser || trades.length === 0) return;
    if (!firstLoadDone.current) {
      trades.forEach(t => seenTradeIds.current.add(t.id));
      firstLoadDone.current = true;
      return;
    }
    const myNewTrades = trades.filter(t =>
      !seenTradeIds.current.has(t.id) &&
      (t.buyer_id === currentUser.id || t.seller_id === currentUser.id)
    );
    if (myNewTrades.length > 0) {
      const t = myNewTrades[0];
      const isBuyer = t.buyer_id === currentUser.id;
      setTradeAlert({
        role: isBuyer ? 'קנייה' : 'מכירה',
        counterparty: isBuyer ? (t.seller_username || 'אנונימי') : (t.buyer_username || 'אנונימי'),
        quantity: t.quantity,
        price: t.price,
        time: t.executed_at,
      });
    }
    trades.forEach(t => seenTradeIds.current.add(t.id));
  }, [trades, currentUser]);

  useEffect(() => { if (currentPrice > 0) setLimitPrice(currentPrice.toFixed(2)); }, [currentPrice]);
  useEffect(() => { if (currentUser && screen === 'app') loadUserData(currentUser.id); }, [tab]);

  const handleLogin = async () => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      let users = await sb(`users?username=eq.${encodeURIComponent(username.trim())}&is_admin=eq.false`);
      if (users.length === 0) {
        users = await sb('users', { method: 'POST', body: JSON.stringify({ username: username.trim(), balance: 500, is_admin: false, status: 'pending' }) });
        const newUser = Array.isArray(users) ? users[0] : users;
        setCurrentUser(newUser);
        localStorage.setItem('kdm_username', newUser.username);
        setScreen('pending');
        setLoading(false);
        return;
      }
      const user = Array.isArray(users) ? users[0] : users;
      if (user.status === 'pending') {
        setCurrentUser(user);
        localStorage.setItem('kdm_username', user.username);
        setScreen('pending');
        setLoading(false);
        return;
      }
      if (user.status === 'rejected') {
        showMsg('הבקשה שלך נדחתה. פנה למנהל', true);
        setLoading(false);
        return;
      }
      setCurrentUser(user);
      localStorage.setItem('kdm_username', user.username);
      setScreen('app');
      await loadUserData(user.id);
    } catch (e) { showMsg('שגיאה בכניסה', true); }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('kdm_username');
    setCurrentUser(null);
    setUsername('');
    setScreen('login');
  };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) setScreen('admin');
    else showMsg('סיסמה שגויה', true);
  };

  const tryMatchOrders = async (newOrder, allOpenOrders) => {
    if (newOrder.type === 'buy') {
      const candidates = allOpenOrders.filter(o =>
        o.type === 'sell' &&
        parseFloat(o.price) <= parseFloat(newOrder.price) &&
        o.user_id !== newOrder.user_id &&
        o.status === 'open'
      );
      const matchingSell = candidates.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
      if (matchingSell) {
        await executeMatch(newOrder, matchingSell, parseFloat(matchingSell.price), Math.min(newOrder.quantity, matchingSell.quantity));
        return true;
      }
    } else {
      const candidates = allOpenOrders.filter(o =>
        o.type === 'buy' &&
        parseFloat(o.price) >= parseFloat(newOrder.price) &&
        o.user_id !== newOrder.user_id &&
        o.status === 'open'
      );
      const matchingBuy = candidates.sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0];
      if (matchingBuy) {
        await executeMatch(matchingBuy, newOrder, parseFloat(matchingBuy.price), Math.min(newOrder.quantity, matchingBuy.quantity));
        return true;
      }
    }
    return false;
  };

  const executeMatch = async (buyOrder, sellOrder, price, quantity) => {
    await sb('trades', { method: 'POST', body: JSON.stringify({
      buy_order_id: buyOrder.id,
      sell_order_id: sellOrder.id,
      buyer_id: buyOrder.user_id,
      seller_id: sellOrder.user_id,
      buyer_username: buyOrder.username,
      seller_username: sellOrder.username,
      quantity,
      price
    }) });

    await sb(`orders?id=eq.${buyOrder.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executed' }) });

    const remainingQty = sellOrder.quantity - quantity;
    if (remainingQty > 0) {
      await sb(`orders?id=eq.${sellOrder.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: remainingQty }) });
    } else {
      await sb(`orders?id=eq.${sellOrder.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executed' }) });
    }

    const buyerHoldings = await sb(`holdings?user_id=eq.${buyOrder.user_id}`);
    const bh = buyerHoldings[0] || { quantity: 0, avg_buy_price: 0 };
    const newQty = bh.quantity + quantity;
    const newAvg = ((bh.quantity * bh.avg_buy_price) + (quantity * price)) / newQty;
    if (buyerHoldings.length > 0) {
      await sb(`holdings?user_id=eq.${buyOrder.user_id}`, { method: 'PATCH', body: JSON.stringify({ quantity: newQty, avg_buy_price: newAvg }) });
    } else {
      await sb('holdings', { method: 'POST', body: JSON.stringify({ user_id: buyOrder.user_id, quantity: newQty, avg_buy_price: newAvg }) });
    }

    const sellerHoldings = await sb(`holdings?user_id=eq.${sellOrder.user_id}`);
    if (sellerHoldings.length > 0) {
      await sb(`holdings?user_id=eq.${sellOrder.user_id}`, { method: 'PATCH', body: JSON.stringify({ quantity: sellerHoldings[0].quantity - quantity }) });
    }

    const sellerUsers = await sb(`users?id=eq.${sellOrder.user_id}`);
    if (sellerUsers[0]) {
      await sb(`users?id=eq.${sellOrder.user_id}`, { method: 'PATCH', body: JSON.stringify({ balance: sellerUsers[0].balance + (price * quantity) }) });
    }

    const priceImpact = quantity * 0.02;
    const lastPrice = parseFloat(price);
    const isBuy = buyOrder.user_id !== 'pool';
    const newPrice = isBuy
      ? parseFloat((lastPrice + priceImpact).toFixed(2))
      : parseFloat((lastPrice - priceImpact).toFixed(2));
    await sb('price_history', { method: 'POST', body: JSON.stringify({ price: newPrice }) });
  };

  const handleTrade = async () => {
    if (!currentUser || !qty || !limitPrice) return;
    if (!tradingOpen) { showMsg('המסחר סגור כרגע', true); return; }
    const price = parseFloat(limitPrice), quantity = parseInt(qty), total = price * quantity;
    if (orderType === 'קנייה' && total > (currentUser.balance || 0)) { showMsg('אין מספיק יתרה', true); return; }
    if (orderType === 'מכירה' && (!holding || holding.quantity < quantity)) { showMsg('אין מספיק מניות', true); return; }
    setLoading(true);
    try {
      if (orderType === 'קנייה') {
        await sb(`users?id=eq.${currentUser.id}`, { method: 'PATCH', body: JSON.stringify({ balance: currentUser.balance - total }) });
      }
      if (orderType === 'מכירה') {
        await sb(`holdings?user_id=eq.${currentUser.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: holding.quantity - quantity }) });
      }
      const newOrders = await sb('orders', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, username: currentUser.username, type: orderType === 'קנייה' ? 'buy' : 'sell', quantity, price, status: 'open' }) });
      const newOrder = Array.isArray(newOrders) ? newOrders[0] : newOrders;
      const openOrders = await sb('orders?status=eq.open&order=created_at.asc');
      const matched = await tryMatchOrders(newOrder, openOrders);
      if (matched) showMsg('עסקה בוצעה! 🎉');
      else showMsg(`פקודת ${orderType} נשלחה ומחכה להתאמה ⏳`);
      await loadData();
      await loadUserData(currentUser.id);
    } catch (e) { showMsg('שגיאה: ' + e.message, true); }
    setLoading(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !currentUser) return;
    try {
      await sb('chat_messages', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, username: currentUser.username, message: chatInput.trim() }) });
      setChatInput('');
      await loadData();
    } catch (e) { console.error(e); }
  };

  const handleUnlock = async (item) => {
    if (!currentUser || currentUser.balance < item.price) { showMsg('אין מספיק יתרה', true); return; }
    if (myPurchases.includes(item.id)) { showMsg('כבר רכשת את התמונה הזו'); return; }
    try {
      await sb(`users?id=eq.${currentUser.id}`, { method: 'PATCH', body: JSON.stringify({ balance: currentUser.balance - item.price }) });
      await sb('store_purchases', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, item_id: item.id }) });
      showMsg('התמונה נרכשה! 🎉');
      await loadData();
      await loadUserData(currentUser.id);
    } catch (e) { showMsg('שגיאה', true); }
  };

  const handleCancelMyOrder = async (order) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      if (order.type === 'buy') {
        await sb(`users?id=eq.${currentUser.id}`, { method: 'PATCH', body: JSON.stringify({ balance: currentUser.balance + (order.quantity * order.price) }) });
      } else {
        const holdingsList = await sb(`holdings?user_id=eq.${currentUser.id}`);
        const h = holdingsList[0] || { quantity: 0 };
        await sb(`holdings?user_id=eq.${currentUser.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: h.quantity + order.quantity }) });
      }
      await sb(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      showMsg('הפקודה בוטלה והמזומן/מניות הוחזרו ✅');
      await loadData();
      await loadUserData(currentUser.id);
    } catch (e) { showMsg('שגיאה: ' + e.message, true); }
    setLoading(false);
  };

  const portfolioValue = (holding?.quantity || 0) * currentPrice;
  const totalPortfolio = (currentUser?.balance || 0) + portfolioValue;
  const pnl = (holding?.quantity || 0) * (currentPrice - (holding?.avg_buy_price || 0));
  const totalValue = (parseInt(qty) * parseFloat(limitPrice || 0)).toFixed(2);
  const myOrders = orders.filter(o => o.user_id === currentUser?.id && o.status === 'open');
  const myExecuted = orders.filter(o => o.user_id === currentUser?.id && o.status === 'executed');

  const inp = { width: '100%', background: '#0a0e17', border: '1px solid #1e2535', borderRadius: 8, padding: '12px 14px', color: '#fff', fontSize: 15, outline: 'none', marginBottom: 10 };
  const card = { background: '#111827', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #1e2535' };
  const lbl = { fontSize: 10, letterSpacing: 2, color: '#5c6480', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', display: 'block' };

  if (screen === 'checking') return (
    <div style={{ background: '#0a0e17', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>KDM</div>
    </div>
  );

  if (screen === 'admin') return <AdminPanel/>;

  if (screen === 'pending') return (
    <div style={{ background: '#0a0e17', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>מחכה לאישור</div>
          <div style={{ fontSize: 14, color: '#9aa0b8', marginBottom: 24, lineHeight: 1.6 }}>
            הבקשה שלך בשם <span style={{ color: '#4f7cff', fontWeight: 700 }}>{currentUser?.username}</span> נשלחה למנהל.
            תוכל להיכנס ברגע שתאושר.
          </div>
          <button style={{ width: '100%', padding: 14, fontSize: 14, fontWeight: 700, borderRadius: 10, border: '1px solid #1e2535', cursor: 'pointer', background: 'transparent', color: '#9aa0b8' }} onClick={async () => {
            const users = await sb(`users?id=eq.${currentUser.id}`);
            if (users[0]?.status === 'approved') { setCurrentUser(users[0]); setScreen('app'); await loadUserData(users[0].id); }
            else if (users[0]?.status === 'rejected') { showMsg('הבקשה נדחתה', true); setScreen('login'); }
            else { showMsg('עדיין מחכה לאישור...'); }
          }}>בדוק סטטוס</button>
          <button style={{ width: '100%', padding: 12, fontSize: 13, marginTop: 10, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#5c6480' }} onClick={() => setScreen('login')}>חזרה</button>
        </div>
      </div>
    </div>
  );

  if (screen === 'login') return (
    <div style={{ background: '#0a0e17', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ ...card, padding: 32 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 4 }}>KDM</div>
          <div style={{ fontSize: 14, color: '#5c6480', textAlign: 'center', marginBottom: 4 }}>הבורסה של קדם</div>
          <div style={{ fontSize: 12, color: '#ff4d6d', textAlign: 'center', marginBottom: 28, fontWeight: 600 }}>⚠️ שם המשתמש שלך הוא הזהות שלך – בחר בקפידה!</div>
          {msg && <div style={{ background: '#ff4d6d20', border: '1px solid #ff4d6d', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#ff4d6d' }}>{msg.text}</div>}
          <input style={inp} placeholder="בחר שם משתמש" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}/>
          <button style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#4f7cff', color: '#fff', marginBottom: 16 }} onClick={handleLogin} disabled={loading}>{loading ? 'נכנס...' : 'כניסה לבורסה'}</button>
          <div style={{ borderTop: '1px solid #1e2535', paddingTop: 16 }}>
            <div style={{ fontSize: 11, color: '#5c6480', marginBottom: 8, textAlign: 'center' }}>כניסת מנהל</div>
            <input style={{ ...inp, marginBottom: 8 }} type="password" placeholder="סיסמת אדמין" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}/>
            <button style={{ width: '100%', padding: 12, fontSize: 13, fontWeight: 700, borderRadius: 8, border: '1px solid #1e2535', cursor: 'pointer', background: 'transparent', color: '#9aa0b8' }} onClick={handleAdminLogin}>כניסת מנהל</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#0a0e17', maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', direction: 'rtl', color: '#e8eaf0' }}>

      {tradeAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={() => setTradeAlert(null)}>
          <div style={{ background: '#111827', borderRadius: 16, padding: 28, maxWidth: 340, width: '100%', border: `2px solid ${tradeAlert.role === 'קנייה' ? '#00c896' : '#ff4d6d'}`, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{tradeAlert.role === 'קנייה' ? '🎯' : '💰'}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 16 }}>עסקה בוצעה!</div>
            <div style={{ background: '#0a0e17', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#5c6480' }}>פעולה</span><span style={{ fontWeight: 700, color: tradeAlert.role === 'קנייה' ? '#00c896' : '#ff4d6d' }}>{tradeAlert.role}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#5c6480' }}>{tradeAlert.role === 'קנייה' ? 'מהמשתמש' : 'למשתמש'}</span><span style={{ fontWeight: 700, color: '#fff' }}>{tradeAlert.counterparty}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#5c6480' }}>כמות</span><span style={{ fontWeight: 700, color: '#fff' }}>{tradeAlert.quantity} מניות</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#5c6480' }}>מחיר</span><span style={{ fontWeight: 700, color: '#fff' }}>${parseFloat(tradeAlert.price).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#5c6480' }}>זמן</span><span style={{ fontWeight: 700, color: '#fff' }}>{new Date(tradeAlert.time).toLocaleString('he-IL')}</span></div>
            </div>
            <button onClick={() => setTradeAlert(null)} style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f7cff', color: '#fff' }}>סגור</button>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #1e2535' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: '#5c6480', fontWeight: 600, marginBottom: 4 }}>KDM · EXCHANGE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>קדם</div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1 }}>${currentPrice.toFixed(2)}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: isUp ? '#00c896' : '#ff4d6d' }}>{isUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)} ({isUp ? '+' : ''}{priceChangePct}%)</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: '#5c6480' }}>שווי שוק <span style={{ color: '#9aa0b8', fontWeight: 600 }}>${(currentPrice * 10000).toLocaleString()}</span></div>
          <div style={{ fontSize: 11, color: '#5c6480' }}>שלום, <span style={{ color: '#9aa0b8', fontWeight: 600 }}>{currentUser?.username}</span> <span onClick={handleLogout} style={{ color: '#ff4d6d', cursor: 'pointer', fontWeight: 600, marginRight: 4 }}>(התנתק)</span></div>
          <div style={{ fontSize: 11, color: '#5c6480' }}>מזומן <span style={{ color: '#9aa0b8', fontWeight: 600 }}>${(currentUser?.balance || 0).toFixed(0)}</span></div>
          <div style={{ fontSize: 11, color: '#5c6480' }}>מניות <span style={{ color: '#9aa0b8', fontWeight: 600 }}>{holding?.quantity || 0} יח'</span></div>
          <div style={{ fontSize: 11, fontWeight: 700, color: tradingOpen ? '#00c896' : '#ff4d6d' }}>{tradingOpen ? '🟢 מסחר פתוח' : `🔴 מסחר סגור · נפתח ${tradingHours.open}`}</div>
        </div>
      </div>

      <div style={{ padding: '12px 20px 0', borderBottom: '1px solid #1e2535' }}>
        <SVGChart data={priceHistory} isUp={isUp}/>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1e2535', background: '#0a0e17', position: 'sticky', top: 0, zIndex: 10, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, minWidth: 60, padding: '13px 0', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'transparent', color: tab === t ? '#fff' : '#5c6480', borderBottom: tab === t ? '2px solid #4f7cff' : '2px solid transparent', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
        {msg && <div style={{ background: msg.isError ? '#ff4d6d20' : '#00c89620', border: `1px solid ${msg.isError ? '#ff4d6d' : '#00c896'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: msg.isError ? '#ff4d6d' : '#00c896', fontWeight: 600 }}>{msg.isError ? '⚠️ ' : '✓ '}{msg.text}</div>}

        {tab === 'מסחר' && (
          <div>
            {!tradingOpen && (
              <div style={{ background: '#ff4d6d15', border: '1px solid #ff4d6d40', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ff4d6d', marginBottom: 4 }}>🔴 המסחר סגור</div>
                <div style={{ fontSize: 13, color: '#9aa0b8' }}>שעות מסחר: {tradingHours.open} – {tradingHours.close}</div>
              </div>
            )}
            <div style={card}>
              <span style={lbl}>פקודת מסחר</span>
              <div style={{ display: 'flex', background: '#0a0e17', borderRadius: 8, padding: 3, marginBottom: 16, border: '1px solid #1e2535' }}>
                {['קנייה','מכירה'].map(t => (
                  <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: orderType === t ? (t === 'קנייה' ? '#00c896' : '#ff4d6d') : 'transparent', color: orderType === t ? '#000' : '#5c6480' }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#5c6480', marginBottom: 6 }}>כמות מניות</div>
              <input style={inp} type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}/>
              <div style={{ fontSize: 11, color: '#5c6480', marginBottom: 6 }}>מחיר לימיט (דולר)</div>
              <input style={inp} type="number" step="0.01" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5c6480', padding: '12px 0', borderTop: '1px solid #1e2535', marginBottom: 16 }}>
                <span>סה"כ</span><span style={{ color: '#fff', fontWeight: 700 }}>${totalValue}</span>
              </div>
              <button onClick={handleTrade} disabled={loading || !tradingOpen} style={{ width: '100%', padding: 16, fontSize: 15, fontWeight: 700, borderRadius: 10, border: 'none', cursor: tradingOpen ? 'pointer' : 'not-allowed', background: !tradingOpen ? '#1e2535' : orderType === 'קנייה' ? '#00c896' : '#ff4d6d', color: !tradingOpen ? '#5c6480' : '#000', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'שולח...' : !tradingOpen ? 'המסחר סגור' : `${orderType} ${qty} מניות`}
              </button>
            </div>

            <div style={{ background: '#4f7cff15', border: '1px solid #4f7cff40', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#9aa0b8', lineHeight: 1.6 }}>
              💡 כל פקודות קנייה צריכות להתקיים מול מישהו שמוכר, וכל פקודות מכירה צריכות להתקיים מול מישהו שקונה. אם אין התאמה מיידית, הפקודה שלך תחכה בתור עד שמישהו מתאים יבוא.
            </div>

            <span style={lbl}>פקודות פתוחות בשוק ({orders.filter(o => o.status === 'open').length})</span>
            <div style={card}>
              {orders.filter(o => o.status === 'open').length === 0 && <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 16 }}>אין פקודות פתוחות</div>}
              {orders.filter(o => o.status === 'open').map((o, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2535', fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: o.type === 'buy' ? '#00c89620' : '#ff4d6d20', color: o.type === 'buy' ? '#00c896' : '#ff4d6d' }}>{o.type === 'buy' ? 'קנייה' : 'מכירה'}</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{o.username || 'אנונימי'}</span>
                  <span style={{ color: '#9aa0b8' }}>{o.quantity} מניות</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>${parseFloat(o.price).toFixed(2)}</span>
                  <span style={{ color: '#4f7cff', fontSize: 11 }}>ממתינה</span>
                </div>
              ))}
            </div>

            {myOrders.length > 0 && (
              <div>
                <span style={lbl}>הפקודות שלי</span>
                <div style={card}>
                  {myOrders.map((o, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2535', fontSize: 13 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: o.type === 'buy' ? '#00c89620' : '#ff4d6d20', color: o.type === 'buy' ? '#00c896' : '#ff4d6d' }}>{o.type === 'buy' ? 'קנייה' : 'מכירה'}</span>
                      <span style={{ color: '#9aa0b8' }}>{o.quantity} מניות</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>${parseFloat(o.price).toFixed(2)}</span>
                      <button onClick={() => handleCancelMyOrder(o)} disabled={loading} style={{ background: 'none', border: '1px solid #ff4d6d', borderRadius: 6, padding: '4px 10px', color: '#ff4d6d', cursor: 'pointer', fontSize: 11 }}>בטל</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {myExecuted.length > 0 && (
              <div>
                <span style={lbl}>עסקאות שבוצעו</span>
                <div style={card}>
                  {myExecuted.map((o, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2535', fontSize: 13 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: o.type === 'buy' ? '#00c89620' : '#ff4d6d20', color: o.type === 'buy' ? '#00c896' : '#ff4d6d' }}>{o.type === 'buy' ? 'קנייה' : 'מכירה'}</span>
                      <span style={{ color: '#9aa0b8' }}>{o.quantity} מניות</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>${parseFloat(o.price).toFixed(2)}</span>
                      <span style={{ color: '#00c896', fontSize: 11 }}>✓ בוצע</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #1e2535', margin: '24px 0', paddingTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9aa0b8', marginBottom: 16 }}>📊 כל הפעולות בשוק</div>
            </div>

            <span style={lbl}>עסקאות שבוצעו ({trades.length})</span>
            <div style={card}>
              {trades.length === 0 && <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 16 }}>אין עסקאות עדיין</div>}
              {trades.map((t, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #1e2535' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#00c89620', color: '#00c896' }}>✓ בוצע</span>
                    <span style={{ color: '#5c6480', fontSize: 11 }}>{new Date(t.executed_at).toLocaleString('he-IL')}</span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{t.buyer_username || 'אנונימי'}</span>
                    <span style={{ color: '#00c896', fontWeight: 600 }}> קנה מ</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}> {t.seller_username || 'אנונימי'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: '#9aa0b8' }}>{t.quantity} מניות</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>${parseFloat(t.price).toFixed(2)} למניה</span>
                    <span style={{ color: '#9aa0b8' }}>סה"כ ${(t.quantity * parseFloat(t.price)).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <span style={lbl}>פקודות שבוטלו ({orders.filter(o => o.status === 'cancelled').length})</span>
            <div style={card}>
              {orders.filter(o => o.status === 'cancelled').length === 0 && <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 16 }}>אין פקודות שבוטלו</div>}
              {orders.filter(o => o.status === 'cancelled').map((o, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2535', fontSize: 13, opacity: 0.6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: o.type === 'buy' ? '#00c89620' : '#ff4d6d20', color: o.type === 'buy' ? '#00c896' : '#ff4d6d' }}>{o.type === 'buy' ? 'קנייה' : 'מכירה'}</span>
                  <span style={{ color: '#9aa0b8' }}>{o.username || 'אנונימי'}</span>
                  <span style={{ color: '#9aa0b8' }}>{o.quantity} מניות</span>
                  <span style={{ color: '#9aa0b8' }}>${parseFloat(o.price).toFixed(2)}</span>
                  <span style={{ color: '#ff4d6d', fontSize: 11 }}>בוטלה</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'דיווחים' && (
          <div>
            <span style={lbl}>עדכונים שוטפים</span>
            {reports.length === 0 && <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 32 }}>אין דיווחים עדיין</div>}
            {reports.map((r, i) => (
              <div key={i} style={{ ...card, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#5c6480', marginBottom: 8 }}>{new Date(r.created_at).toLocaleString('he-IL')}</div>
                {r.title && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{r.title}</div>}
                <div style={{ fontSize: 14, color: '#c8ccd8', lineHeight: 1.6 }}>{r.content}</div>
                {r.image_url && <img src={r.image_url} style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 200, objectFit: 'cover' }}/>}
              </div>
            ))}
          </div>
        )}

        {tab === "צ'אט" && (
          <div>
            <span style={lbl}>חדר מסחר</span>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
              {chatMessages.map((m, i) => {
                const isMe = m.username === currentUser?.username;
                return (
                  <div key={i} style={{ maxWidth: '80%', marginBottom: 12, alignSelf: isMe ? 'flex-start' : 'flex-end', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-start' : 'flex-end' }}>
                    <div style={{ background: isMe ? '#4f7cff20' : '#1e2535', borderRadius: isMe ? '12px 12px 12px 0' : '12px 12px 0 12px', padding: '10px 14px', fontSize: 14, color: '#e8eaf0', border: `1px solid ${isMe ? '#4f7cff40' : '#1e2535'}` }}>{m.message}</div>
                    <div style={{ fontSize: 10, color: '#5c6480', marginTop: 4 }}>{m.username} · {new Date(m.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef}/>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input style={{ ...inp, flex: 1, marginBottom: 0 }} placeholder="כתוב הודעה..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat()}/>
              <button onClick={handleChat} style={{ background: '#4f7cff', border: 'none', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>שלח</button>
            </div>
          </div>
        )}

        {tab === 'ארנק' && (
          <div>
            <span style={lbl}>הפורטפוליו שלך</span>
            <div style={card}>
              {[
                { label: 'יתרת מזומן', val: `$${(currentUser?.balance || 0).toFixed(2)}` },
                { label: 'מניות KDM', val: `${holding?.quantity || 0} יח'` },
                { label: 'שווי מניות', val: `$${portfolioValue.toFixed(2)}` },
                { label: 'שווי תיק כולל', val: `$${totalPortfolio.toFixed(2)}` },
                { label: 'מחיר קנייה ממוצע', val: `$${(holding?.avg_buy_price || 0).toFixed(2)}` },
                { label: 'רווח / הפסד', val: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? '#00c896' : '#ff4d6d' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #1e2535', fontSize: 14 }}>
                  <span style={{ color: '#5c6480' }}>{item.label}</span>
                  <span style={{ color: item.color || '#fff', fontWeight: 700 }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'חברים' && (
          <div>
            <span style={lbl}>חברי חדר המסחר ({allUsers.length})</span>
            {allUsers.map((u, i) => {
              const userOrders = orders.filter(o => o.user_id === u.id && o.status === 'open');
              const userHolding = allHoldings.find(h => h.user_id === u.id) || { quantity: 0, avg_buy_price: 0 };
              return (
                <div key={i} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e2535', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#4f7cff' }}>{u.username[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: u.id === currentUser?.id ? '#4f7cff' : '#fff' }}>{u.username} {u.id === currentUser?.id ? '(אתה)' : ''}</div>
                      </div>
                    </div>
                    {userOrders.length > 0 && <div style={{ fontSize: 11, color: '#4f7cff', fontWeight: 600 }}>{userOrders.length} פקודות פתוחות</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, background: '#0a0e17', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#5c6480', marginBottom: 4 }}>מזומן</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>${(u.balance || 0).toFixed(0)}</div>
                    </div>
                    <div style={{ flex: 1, background: '#0a0e17', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#5c6480', marginBottom: 4 }}>מניות</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{userHolding.quantity || 0}</div>
                    </div>
                    <div style={{ flex: 1, background: '#0a0e17', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#5c6480', marginBottom: 4 }}>מחיר קנייה ממוצע</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>${(userHolding.avg_buy_price || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'חנות' && (
          <div>
            <span style={lbl}>תמונות חסויות</span>
            <div style={{ color: '#5c6480', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>תמונות בלעדיות של קדם. שלם כדי לחשוף.</div>
            {storeItems.length === 0 && <div style={{ color: '#5c6480', fontSize: 13, textAlign: 'center', padding: 32 }}>החנות ריקה כרגע</div>}
            {storeItems.map((item, i) => {
              const owned = myPurchases.includes(item.id);
              const buyers = allPurchases.filter(p => p.item_id === item.id).map(p => {
                const u = allUsers.find(u => u.id === p.user_id);
                return u ? u.username : 'אנונימי';
              });
              return (
                <div key={i} style={card}>
                  {item.image_url && !owned && <img src={item.image_url} style={{ width: '100%', borderRadius: 8, marginBottom: 12, maxHeight: 150, objectFit: 'cover', filter: 'blur(12px)' }}/>}
                  {item.image_url && owned && <img src={item.image_url} style={{ width: '100%', borderRadius: 8, marginBottom: 12, maxHeight: 200, objectFit: 'cover' }}/>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: buyers.length > 0 ? 10 : 0 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{owned ? '🖼️' : '🔒'} {item.title}</div>
                      <div style={{ fontSize: 12, color: '#5c6480' }}>{item.description}</div>
                    </div>
                    {owned
                      ? <span style={{ color: '#00c896', fontSize: 12, fontWeight: 700 }}>נרכש ✓</span>
                      : <button onClick={() => handleUnlock(item)} style={{ background: '#4f7cff', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>${item.price}</button>
                    }
                  </div>
                  {buyers.length > 0 && (
                    <div style={{ borderTop: '1px solid #1e2535', paddingTop: 10, fontSize: 12, color: '#9aa0b8' }}>
                      <span style={{ color: '#5c6480' }}>נרכש על ידי: </span>{buyers.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
