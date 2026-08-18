# Connecting Kilo Auto Spares Ltd to Supabase

Your site's code is already pointed at your Supabase project
(`supabase.js`) using the key you shared. You still need to
create the **database table** and (optionally) the **image
storage bucket** in your Supabase dashboard — a few minutes of
one-time setup.

## 1. Create the `products` table

1. Go to your Supabase project → **SQL Editor** → **New query**.
2. Paste the SQL below and click **Run**.

```sql
create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  brand text,
  category text not null,
  subcategory text,
  price numeric not null,
  original_price numeric,
  image text,
  description text,
  created_at timestamptz default now()
);

alter table products enable row level security;

-- Anyone (including visitors browsing your site) can read products.
create policy "Public can read products"
  on products for select
  using (true);

-- Anyone with your publishable key can add/edit/delete products.
-- This matches the simple password-gated Admin page — it is NOT
-- strong security. Don't store anything on this site you wouldn't
-- want a determined visitor to be able to edit. If that ever
-- matters more, ask about switching this policy to require
-- Supabase Auth (real staff logins) instead.
create policy "Public can write products"
  on products for all
  using (true)
  with check (true);
```

> This one `for all` policy already covers add, edit, **and delete**
> (that's what makes the trash-icon button in Admin work — it sends a
> `DELETE` request to this table). If you ever recreate this table or
> its policies by hand and the Delete button in Admin stops working,
> re-run just the `create policy "Public can write products" ...`
> block above — that's the policy responsible for it.

3. (Optional but recommended) Load your current catalogue in one
   go instead of re-typing everything in Admin. Run this once,
   right after the table above:

```sql
insert into products (name, brand, category, subcategory, price, original_price, image, description) values
('Front Shock Absorber','Sachs','Suspension Parts','Shock Absorbers',13500,14500,'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&q=80','Genuine-spec front shock absorber for German saloons. Sold individually.'),
('Rear Shock Absorber Set','KYB','Suspension Parts','Shock Absorbers',8500,null,'https://images.unsplash.com/photo-1552930219-29d889622d2e?w=600&q=80','Matched pair for Japanese saloons and light SUVs, direct fit.'),
('Front Control Arm Assembly','Moog','Suspension Parts','Control Arms',11000,12000,'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&q=80','Complete assembly with bushings and ball joint, ready to bolt on.'),
('Stabilizer Link Kit','Febi','Suspension Parts','Stabilizer Links',3200,null,'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=600&q=80','Heavy-duty front stabilizer links, sold as a pair.'),
('Front Wheel Bearing Kit','SKF','Suspension Parts','Wheel Bearings',5200,5800,'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&q=80','Sealed wheel bearing kit with hub, direct fit for most Japanese saloons.'),
('Rubber Arm Bush (Pair)','Febest','Suspension Parts','Rubber Arm Bushes',1800,null,'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=600&q=80','Front lower arm bushings, sold as a matched pair.'),
('Ventilated Brake Discs (Pair)','Brembo','Suspension Parts','Brake Discs',16500,18000,'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=600&q=80','Performance ventilated discs for improved cooling under braking.'),
('Ceramic Brake Pads (Front)','Bosch','Service Parts','Brake Pads',6000,6500,'https://images.unsplash.com/photo-1563720223185-11003d516935?w=600&q=80','Low-dust ceramic compound, quiet and long-lasting.'),
('Engine Oil Filter','Mann','Service Parts','Oil Filter',1500,null,'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&q=80','OEM-spec spin-on oil filter.'),
('Cabin & Air Filter Combo','Bosch','Service Parts','Air Filters',3200,3500,'https://images.unsplash.com/photo-1552930219-29d889622d2e?w=600&q=80','High-flow engine air filter with matching cabin filter.'),
('Iridium Spark Plugs (Set of 4)','NGK','Service Parts','Spark Plugs',5500,6000,'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=600&q=80','Long-life iridium tips for smoother idle and better fuel economy.'),
('Synthetic Engine Oil 5W-30 (4L)','Total','Service Parts','Engine Oil',7200,7800,'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=600&q=80','Fully synthetic 5W-30, ILSAC GF-6A rated. 4 litre container.'),
('Ignition Coil Pack','Delphi','Service Parts','Ignition Coils',5000,5500,'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=600&q=80','Heavy-duty coil pack, direct OEM replacement.'),
('Oxygen (O2) Lambda Sensor','Denso','Engine Parts','Sensors',9500,null,'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&q=80','Direct-fit lambda sensor for accurate fuel mixture control.'),
('Water Pump Assembly','Aisin','Engine Parts','Water Pumps',8800,9500,'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&q=80','Complete water pump assembly, gasket included.'),
('Timing Belt Tensioner Roller','Febi','German Parts',null,6200,6999,'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=600&q=80','OEM-spec tensioning roller for German engines.'),
('Front Suspension Strut','Sachs','German Parts',null,15600,17000,'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&q=80','Complete front strut assembly for German saloons and SUVs.'),
('Toyota Full Service Kit','Assorted','Service Kits','Japanese Cars',9000,10000,'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=600&q=80','Complete service kit: oil filter, air filter, fuel filter and engine oil bundled together.'),
('Maintenance-Free Battery (65Ah)','Bosch','Car Batteries',null,13000,13500,'https://images.unsplash.com/photo-1563720223185-11003d516935?w=600&q=80','Sealed DIN battery, no top-up required.'),
('NS60 Chloride Exide Battery','Chloride Exide','Car Batteries',null,8000,8500,'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=600&q=80','Reliable starter battery for popular Japanese saloons.'),
('195/65R15 Car Tyre','Petromax','Tyres',null,7000,7800,'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=600&q=80','Reliable all-round tyre size 195/65R15, price inclusive of professional fitment.');
```

## 2. Create the `site_settings` table (for the Show/Hide Prices toggle)

This powers the **Prices** toggle button in Admin, which lets you hide
prices from visitors on the live site (Home, Shop, Quick View, Cart,
and the WhatsApp messages) while you can still see real prices in
Admin at all times. In the SQL Editor, run:

```sql
create table if not exists site_settings (
  id bigint primary key,
  show_prices boolean not null default true
);

insert into site_settings (id, show_prices) values (1, true)
on conflict (id) do nothing;

alter table site_settings enable row level security;

create policy "Public can read site settings"
  on site_settings for select
  using (true);

create policy "Public can write site settings"
  on site_settings for all
  using (true)
  with check (true);
```

Until this table exists, the site simply defaults to showing prices
as normal — nothing breaks, the Admin toggle just won't have anywhere
to save its setting.

## 3. Create the `category_images` table (for the homepage category tiles)

Powers the **Category Images** button in Admin, which lets you attach a
photo to each of your 7 categories — those photos are what show on the
"Shop by Category" tiles on your homepage. Any category left blank
just shows a plain icon tile instead, so nothing looks broken while
you're still adding photos. In the SQL Editor, run:

```sql
create table if not exists category_images (
  category text primary key,
  image text
);

alter table category_images enable row level security;

create policy "Public can read category images"
  on category_images for select
  using (true);

create policy "Public can write category images"
  on category_images for all
  using (true)
  with check (true);
```

## 4. Create the image storage bucket (for Admin photo uploads)

Only needed if you plan to upload photos from your computer in
Admin (as opposed to always pasting an image link). In the SQL
Editor, run:

```sql
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Public can upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images');

-- Required for the Admin "Delete All Images" button (and any future
-- per-photo delete) to actually remove files from storage. Without
-- this policy, delete requests to the bucket are silently rejected
-- by Supabase (a 403), even though the button itself works fine.
create policy "Public can delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images');
```

> **If you set up your bucket before this update:** just run the
> `create policy "Public can delete product images" ...` block above
> on its own in the SQL Editor — it's safe to run even if the table
> and the other two policies already exist.

## 5. Upload the site files

Upload every file in this folder to your GitHub repo root (same
flat structure as before — no subfolders):

- `index.html` ← updated (Shop by Category tiles + working search)
- `shop.html` ← updated (accepts a category filter from the tiles)
- `about.html`, `contact.html`
- `admin.html` ← updated (new "Category Images" button + modal)
- `style.css`
- `supabase.js` ← updated (category image read/write helpers)
- `products.js` ← updated (category image loading + filter helper)
- `layout.js`
- `cart.js`
- `admin.js` ← updated (Category Images manager)

You no longer need `products-data.json` — the site reads live
from Supabase now. You can delete it from the repo, or leave it,
it's simply unused.

Your product data itself lives in Supabase, not in these files, so
re-uploading these files to GitHub does not touch or overwrite any
product you've already added through Admin — you're only replacing
the site's code, not its data.

## 6. Try it

1. Open your live site — Home and Shop should show the products
   you just inserted in step 1.
2. Open `admin.html`, log in with the password `kiloadmin2026`
   (change this at the top of `admin.js` — search for
   `ADMIN_PASSWORD`).
3. Add a product manually, or use **Upload XLSX / CSV** with a
   file containing columns: `Name`, `Price`, and optionally
   `Category`, `Subcategory`, `Brand`, `OriginalPrice`,
   `Description`, `Image` (a photo link).
4. Refresh Home/Shop in another tab — the change should already
   be there.
5. Try the **Prices** toggle button in the Admin toolbar, then
   refresh Home/Shop in another tab — prices should disappear
   (replaced with "Contact for Price") when it's off, while Admin
   itself keeps showing real prices at all times.
6. On the Home page, type into the search bar at the top — matching
   parts now appear right there on the homepage as you type (Shop's
   search bar still works the same way it always did).
7. Click **Category Images** in the Admin toolbar, upload (or paste a
   link for) a photo against a couple of categories, hit **Save** on
   each, then refresh the Home page — those categories' tiles under
   "Shop by Category" should now show your photos instead of icons.
   Clicking a tile takes visitors to Shop already filtered to that
   category.

## Adding the "Hide from site" feature (active column)

If your `products` table was created before this feature was added,
run this once in the SQL Editor (safe to run even if you're not sure —
`if not exists` skips it if it's already there):

```sql
alter table products add column if not exists active boolean not null default true;
```

This adds a hidden on/off switch per product. Products with `active = false`
are skipped by Home/Shop/About/Contact/Cart, but stay in your database
untouched and still show up in Admin and in the Cleanup tool (marked as
hidden) so you can bring them back any time. Nothing needs to change in
your RLS policies — the existing "Public can write products" policy
already covers updating this column.

## Adding the "Part Number" field

If your `products` table was created before this feature was added,
run this once in the SQL Editor (safe to run even if you're not sure —
`if not exists` skips it if it's already there):

```sql
alter table products add column if not exists part_number text;
```

This adds a dedicated Part Number field, separate from the product
name — used by the Admin **Find Missing Images** tool so you can see
each product's exact part number while you search for and upload its
photo. Existing products will simply have a blank part number until
you fill it in (via Edit Product, or a re-upload with a "Part Number"
column in your XLSX/CSV — see the Bulk Upload help text in Admin).

## A note on security

The key in `supabase.js` is a "publishable" key — safe to ship in
a public site, but it can only do what the RLS policies above
allow. As written, those policies let **anyone who has the key**
(which is visible in your site's source code, like all front-end
code) add, edit, or delete products directly, bypassing the
Admin password entirely if they wanted to poke at the API by
hand. For a small shop catalogue this is a reasonable trade-off —
it's no less secure than the original plan of anyone finding your
GitHub repo — but if you'd like real protection later (e.g. only
logged-in staff can write), say the word and this can be upgraded
to use Supabase Auth with a proper login instead of the shared
password.
