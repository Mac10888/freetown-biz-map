require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const nhostGraphqlUrl =
  process.env.NHOST_GRAPHQL_URL ||
  (process.env.NHOST_SUBDOMAIN && process.env.NHOST_REGION
    ? `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1`
    : '');

const BUSINESS_FIELDS = `
  id
  name
  category
  power
  pos
  lng
  lat
  photo
  created_at
`;

async function graphqlRequest(query, variables) {
  if (!nhostGraphqlUrl) {
    throw new Error('Nhost GraphQL URL is not configured.');
  }

  const response = await fetch(nhostGraphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.NHOST_ADMIN_SECRET
        ? { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET }
        : {})
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();

  if (!response.ok || result.errors?.length) {
    const message = result.errors?.map(error => error.message).join(', ') || response.statusText;
    throw new Error(message);
  }

  return result.data;
}

app.get('/businesses', async (req, res) => {
  try {
    const data = await graphqlRequest(`
      query FetchBusinesses {
        businesses(order_by: { created_at: desc }) {
          ${BUSINESS_FIELDS}
        }
      }
    `);

    res.json(data.businesses || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/businesses', async (req, res) => {
  try {
    const data = await graphqlRequest(
      `
        mutation CreateBusiness($object: businesses_insert_input!) {
          insert_businesses_one(object: $object) {
            ${BUSINESS_FIELDS}
          }
        }
      `,
      { object: req.body }
    );

    res.json(data.insert_businesses_one);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server on port ${port}`));
