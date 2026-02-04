require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.get('/businesses', async (req, res) => {
  const { data } = await supabase.from('businesses').select('*');
  res.json(data);
});

app.post('/businesses', async (req, res) => {
  const { data, error } = await supabase.from('businesses').insert([req.body]);
  res.json({ data, error });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server on port ${port}`));
