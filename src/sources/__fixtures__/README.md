# Saved API responses

Responses used by the adapter tests so they never spend real API calls.

- `live-*.json`: real responses saved from a live call on the date in the
  name. Kept as returned, except Auto.dev's `user` block (account name, email,
  IP and location) and Old Cars Data's long listing text (descriptions, seller
  usernames, service history), which are removed.
- Everything else: synthetic responses that follow each source's documented
  format. Dealers, VINs and prices are made up.
