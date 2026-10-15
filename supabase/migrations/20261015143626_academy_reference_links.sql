-- La referencia de las fases de Weinstein apunta a su libro, no a una guía general.
update public.academy_lessons l
set content_json = jsonb_set(content_json, '{source,url}',
    to_jsonb('https://books.google.com/books/about/Stan_Weinstein_s_Secrets_For_Profiting_i.html?id=vcj8VCPvSPoC'::text)),
    updated_at = now()
from public.academy_levels lv
where l.level_id = lv.id and lv.level_number = 5 and l.order_index = 1;
