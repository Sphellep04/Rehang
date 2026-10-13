insert into public.categories (name, slug, position) values
  ('Women', 'women', 10),
  ('Men', 'men', 20),
  ('Kids', 'kids', 30),
  ('Shoes', 'shoes', 40),
  ('Bags & accessories', 'bags-accessories', 50),
  ('Traditional & occasion wear', 'traditional-occasion-wear', 60),
  ('Workwear', 'workwear', 70)
on conflict (slug) do nothing;

with category_rows(parent_slug, name, slug, position) as (
  values
    ('women', 'Dresses', 'women-dresses', 10),
    ('women', 'Tops & T-shirts', 'women-tops-t-shirts', 20),
    ('women', 'Shirts & blouses', 'women-shirts-blouses', 30),
    ('women', 'Knitwear', 'women-knitwear', 40),
    ('women', 'Jackets & coats', 'women-jackets-coats', 50),
    ('women', 'Jeans', 'women-jeans', 60),
    ('women', 'Trousers', 'women-trousers', 70),
    ('women', 'Skirts', 'women-skirts', 80),
    ('women', 'Shorts', 'women-shorts', 90),
    ('women', 'Suits & blazers', 'women-suits-blazers', 100),
    ('women', 'Activewear', 'women-activewear', 110),
    ('women', 'Swimwear (new/sealed only)', 'women-swimwear-new-sealed', 120),
    ('women', 'Sleepwear', 'women-sleepwear', 130),
    ('women', 'Maternity', 'women-maternity', 140),
    ('men', 'T-shirts', 'men-t-shirts', 10),
    ('men', 'Shirts', 'men-shirts', 20),
    ('men', 'Knitwear', 'men-knitwear', 30),
    ('men', 'Jackets & coats', 'men-jackets-coats', 40),
    ('men', 'Jeans', 'men-jeans', 50),
    ('men', 'Trousers', 'men-trousers', 60),
    ('men', 'Shorts', 'men-shorts', 70),
    ('men', 'Suits & blazers', 'men-suits-blazers', 80),
    ('men', 'Activewear', 'men-activewear', 90),
    ('kids', 'Baby (0–24 months)', 'kids-baby', 10),
    ('kids', 'Girls', 'kids-girls', 20),
    ('kids', 'Boys', 'kids-boys', 30),
    ('kids', 'School uniform', 'kids-school-uniform', 40),
    ('shoes', 'Women', 'shoes-women', 10),
    ('shoes', 'Men', 'shoes-men', 20),
    ('shoes', 'Kids', 'shoes-kids', 30),
    ('bags-accessories', 'Handbags', 'bags-handbags', 10),
    ('bags-accessories', 'Backpacks', 'bags-backpacks', 20),
    ('bags-accessories', 'Wallets', 'bags-wallets', 30),
    ('bags-accessories', 'Belts', 'bags-belts', 40),
    ('bags-accessories', 'Hats & caps', 'bags-hats-caps', 50),
    ('bags-accessories', 'Scarves', 'bags-scarves', 60),
    ('bags-accessories', 'Jewellery', 'bags-jewellery', 70),
    ('bags-accessories', 'Sunglasses', 'bags-sunglasses', 80),
    ('traditional-occasion-wear', 'Traditional and cultural dresses', 'occasion-traditional-dresses', 10),
    ('traditional-occasion-wear', 'Wedding & bridesmaid', 'occasion-wedding-bridesmaid', 20),
    ('traditional-occasion-wear', 'Graduation', 'occasion-graduation', 30),
    ('traditional-occasion-wear', 'Formal & evening', 'occasion-formal-evening', 40),
    ('workwear', 'Office wear', 'workwear-office', 10),
    ('workwear', 'Uniforms & overalls', 'workwear-uniforms-overalls', 20)
)
insert into public.categories (parent_id, name, slug, position)
select parent.id, category_rows.name, category_rows.slug, category_rows.position
from category_rows
join public.categories as parent on parent.slug = category_rows.parent_slug
on conflict (slug) do nothing;

insert into public.size_groups (kind, label, position) values
  ('clothing', 'XXS', 10),
  ('clothing', 'XS', 20),
  ('clothing', 'S', 30),
  ('clothing', 'M', 40),
  ('clothing', 'L', 50),
  ('clothing', 'XL', 60),
  ('clothing', 'XXL', 70),
  ('clothing', '3XL', 80),
  ('clothing', '4XL', 90),
  ('one_size', 'One size', 10)
on conflict (kind, label) do nothing;

insert into public.size_groups (kind, label, position)
select 'shoes',
  case when half_size % 2 = 0 then (half_size / 2)::text else (half_size / 2)::text || '.5' end,
  half_size
from generate_series(2, 26) as sizes(half_size)
on conflict (kind, label) do nothing;

insert into public.size_groups (kind, label, position) values
  ('kids', '0–3m', 10),
  ('kids', '3–6m', 20),
  ('kids', '6–12m', 30),
  ('kids', '12–18m', 40),
  ('kids', '18–24m', 50),
  ('kids', '2–3y', 60),
  ('kids', '3–4y', 70),
  ('kids', '5–6y', 80),
  ('kids', '7–8y', 90),
  ('kids', '9–10y', 100),
  ('kids', '11–12y', 110),
  ('kids', '13–14y', 120)
on conflict (kind, label) do nothing;

insert into public.sizes (system, value, size_group_id)
select 'letter', group_row.label, group_row.id
from public.size_groups as group_row
where group_row.kind = 'clothing'
on conflict (system, value) do nothing;

with mappings(system, value, group_label) as (
  values
    ('uk_sa_women', '4', 'XS'), ('uk_sa_women', '6', 'XS'),
    ('uk_sa_women', '8', 'S'), ('uk_sa_women', '10', 'S'),
    ('uk_sa_women', '12', 'M'), ('uk_sa_women', '14', 'M'),
    ('uk_sa_women', '16', 'L'), ('uk_sa_women', '18', 'XL'),
    ('uk_sa_women', '20', 'XL'), ('uk_sa_women', '22', 'XXL'),
    ('uk_sa_women', '24', 'XXL'), ('uk_sa_women', '26', '3XL'),
    ('eu_women', '32', 'XS'), ('eu_women', '34', 'XS'),
    ('eu_women', '36', 'S'), ('eu_women', '38', 'S'),
    ('eu_women', '40', 'M'), ('eu_women', '42', 'M'),
    ('eu_women', '44', 'L'), ('eu_women', '46', 'XL'),
    ('eu_women', '48', 'XL'), ('eu_women', '50', 'XXL'),
    ('eu_women', '52', 'XXL'), ('eu_women', '54', '3XL')
)
insert into public.sizes (system, value, size_group_id)
select mappings.system, mappings.value, group_row.id
from mappings
join public.size_groups as group_row on group_row.kind = 'clothing' and group_row.label = mappings.group_label
on conflict (system, value) do nothing;

insert into public.sizes (system, value, size_group_id)
select 'uk_sa_shoes', group_row.label, group_row.id
from public.size_groups as group_row
where group_row.kind = 'shoes'
on conflict (system, value) do nothing;

insert into public.sizes (system, value, size_group_id)
select 'kids_age', group_row.label, group_row.id
from public.size_groups as group_row
where group_row.kind = 'kids'
on conflict (system, value) do nothing;

insert into public.sizes (system, value, size_group_id)
select 'one_size', group_row.label, group_row.id
from public.size_groups as group_row
where group_row.kind = 'one_size'
on conflict (system, value) do nothing;
