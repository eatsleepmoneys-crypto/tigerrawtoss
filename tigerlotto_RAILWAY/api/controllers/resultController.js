const { query, queryOne, transaction } = require('../config/db');

// ── POST /admin/lottery/rounds/:id/result — บันทึกผล ──────────
exports.enterResult = async (req, res) => {
  try {
    const roundId = req.params.id;
    const { result_first, result_2_back, result_3_back1, result_3_back2,
            result_3_front1, result_3_front2 } = req.body;

    if (!result_first)
      return res.status(422).json({ error: 'VALIDATION', message: 'กรุณาระบุรางวัลที่ 1' });

    const round = await queryOne("SELECT * FROM lottery_rounds WHERE id=? AND status='closed'", [roundId]);
    if (!round)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'ไม่พบงวดหรืองวดยังไม่ปิด' });

    // ตรวจซ้ำ
    const existing = await queryOne('SELECT id FROM lottery_results WHERE round_id=?', [roundId]);
    if (existing)
      return res.status(409).json({ error: 'ALREADY_RESULTED', message: 'บันทึกผลไปแล้ว' });

    // บันทึกผล
    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO lottery_results
         (round_id,result_first,result_2_back,result_3_back1,result_3_back2,result_3_front1,result_3_front2,entered_by,entered_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())`,
        [roundId, result_first, result_2_back, result_3_back1, result_3_back2,
         result_3_front1, result_3_front2, req.user.id]
      );
      await conn.execute("UPDATE lottery_rounds SET status='resulted', result_at=NOW() WHERE id=?", [roundId]);
    });

    // Process payouts (async — ไม่ block response)
    processPayouts(roundId, {
      result_first, result_2_back, result_3_back1, result_3_back2,
      result_3_front1, result_3_front2
    }).catch(err => console.error('Payout error:', err));

    res.json({ success: true, message: 'บันทึกผลแล้ว กำลังประมวลผลรางวัล...' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
};

// ── Internal: ประมวลผลรางวัลทั้งหมด ───────────────────────────
async function processPayouts(roundId, result) {
  console.log(`[PAYOUT] Processing round ${roundId}...`);

  // ดึง type ของงวด
  const round = await queryOne(
    'SELECT r.lottery_type_id, lt.code FROM lottery_rounds r JOIN lottery_types lt ON r.lottery_type_id=lt.id WHERE r.id=?',
    [roundId]
  );

  // ดึงทุก slip ของงวดนี้
  const slips = await query(
    "SELECT * FROM slips WHERE round_id=? AND status='active'",
    [roundId]
  );

  console.log(`[PAYOUT] ${slips.length} slips to process`);

  for (const slip of slips) {
    await processSlip(slip, result, round.code);
  }

  console.log(`[PAYOUT] Round ${roundId} complete`);
}

async function processSlip(slip, result, ltCode) {
  const items = await query('SELECT * FROM slip_items WHERE slip_id=?', [slip.id]);
  let slipWinTotal = 0;
  let anyWin = false;

  for (const item of items) {
    const { isWin, winAmount } = checkWin(item, result, ltCode);
    await query('UPDATE slip_items SET is_win=?, win_amount=? WHERE id=?', [isWin?1:0, winAmount, item.id]);
    if (isWin) { slipWinTotal += winAmount; anyWin = true; }
  }

  const newStatus = anyWin ? 'won' : 'lost';
  await query('UPDATE slips SET status=?, total_payout=? WHERE id=?', [newStatus, slipWinTotal, slip.id]);

  // จ่ายเงินถ้าถูกรางวัล
  if (slipWinTotal > 0) {
    await transaction(async (conn) => {
      const [wRow] = await conn.execute('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE', [slip.user_id]);
      const before = parseFloat(wRow[0].balance);
      const after  = before + slipWinTotal;

      await conn.execute(
        'UPDATE wallets SET balance=?, total_won=total_won+? WHERE user_id=?',
        [after, slipWinTotal, slip.user_id]
      );
      await conn.execute(
        `INSERT INTO transactions (ref_no,user_id,type,amount,balance_before,balance_after,status,note)
         VALUES (?,?,'win',?,?,?,'success',?)`,
        [`WIN-${slip.id}-${Date.now()}`, slip.user_id, slipWinTotal, before, after, `รางวัลโพย ${slip.slip_no}`]
      );

      // แจ้งเตือน
      await conn.execute(
        `INSERT INTO notifications (user_id,type,title,body,data)
         VALUES (?,'win','🏆 ถูกรางวัล!',?,?)`,
        [slip.user_id,
         `โพย ${slip.slip_no} ถูกรางวัล ฿${slipWinTotal.toLocaleString()}`,
         JSON.stringify({ slip_id: slip.id, amount: slipWinTotal })]
      );
    });
  }
}

// ── ตรวจรางวัลแต่ละรายการ ─────────────────────────────────────
function checkWin(item, result, ltCode) {
  const num = item.number;
  const rate = parseFloat(item.payout_rate);
  const amt  = parseFloat(item.amount);

  // bet_type_id map — ในระบบจริงดึงจาก DB
  // ใช้ตัวย่อสำหรับความสะดวก
  const last2  = (result.result_first || '').slice(-2);
  const last3b = result.result_3_back1 || '';
  const last3b2= result.result_3_back2 || '';
  const front3 = result.result_3_front1 || '';
  const front32= result.result_3_front2 || '';
  const back2  = result.result_2_back || '';

  // อ้างอิงจาก bet_types.code ที่บันทึกใน slip_items
  // ทำ simple version — ระบบจริงควรดึง code จาก bet_types
  let isWin = false;

  switch (item.bet_type_code || '') {
    case '3_top':
      isWin = num === (result.result_first||'').slice(-3); break;
    case '3_bot':
      isWin = num === last3b || num === last3b2; break;
    case '3_front':
      isWin = num === front3 || num === front32; break;
    case '3_tod':
      isWin = sortStr(num) === sortStr((result.result_first||'').slice(-3)); break;
    case '2_top':
    case '2_bot':
      isWin = num === back2; break;
    case 'run_top':
    case 'run_bot':
      isWin = (result.result_first||'').includes(num); break;
    default:
      isWin = false;
  }

  return { isWin, winAmount: isWin ? amt * rate : 0 };
}

function sortStr(s) { return s.split('').sort().join(''); }

exports.processPayouts = processPayouts;
