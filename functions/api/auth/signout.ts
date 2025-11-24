export const onRequest: PagesFunction = async ({ request }) => {
  // In a real implementation, clear session / cookies here.
  return new Response(null, { status: 204 });
};