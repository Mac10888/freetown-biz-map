const explicitGraphqlUrl = process.env.REACT_APP_NHOST_GRAPHQL_URL;
const subdomain = process.env.REACT_APP_NHOST_SUBDOMAIN;
const region = process.env.REACT_APP_NHOST_REGION;

export const nhostGraphqlUrl =
  explicitGraphqlUrl ||
  (subdomain && region ? `https://${subdomain}.graphql.${region}.nhost.run/v1` : '');

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
    throw new Error(
      'Nhost GraphQL URL is missing. Set REACT_APP_NHOST_GRAPHQL_URL or REACT_APP_NHOST_SUBDOMAIN plus REACT_APP_NHOST_REGION.'
    );
  }

  const response = await fetch(nhostGraphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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

function normalizeBusiness(business) {
  return {
    ...business,
    lng: Number(business.lng),
    lat: Number(business.lat),
    pos: Boolean(business.pos)
  };
}

export async function fetchBusinesses() {
  const data = await graphqlRequest(`
    query FetchBusinesses {
      businesses(order_by: { created_at: desc }) {
        ${BUSINESS_FIELDS}
      }
    }
  `);

  return (data.businesses || []).map(normalizeBusiness);
}

export async function createBusiness(input) {
  const data = await graphqlRequest(
    `
      mutation CreateBusiness($object: businesses_insert_input!) {
        insert_businesses_one(object: $object) {
          ${BUSINESS_FIELDS}
        }
      }
    `,
    { object: input }
  );

  return normalizeBusiness(data.insert_businesses_one);
}
