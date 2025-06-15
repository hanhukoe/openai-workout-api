const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.get('/test-supabase', async (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('00_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError) throw userError;

    const { data: intake, error: intakeError } = await supabase
      .from('02_01_program_intake')
      .select('*')
      .eq('user_id', userId);

    if (intakeError) throw intakeError;

    res.json({ user, intake });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
