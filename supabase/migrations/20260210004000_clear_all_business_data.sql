begin;

-- Reset: remove all businesses + dependent data (menu items/offers/messages/reviews/orders/etc).
-- Rationale: listings are meant to be created by owners/staff via the Business Admin Portal.

truncate table public.businesses cascade;

commit;

