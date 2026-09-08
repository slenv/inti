-- ================================================================
-- Inti — Esquema completo (estado final)
-- Ejecuta en Supabase SQL Editor para una DB nueva.
-- Idempotente: safe to run again.
-- ================================================================

-- ================================================================
-- LIMPIEZA PREVIA (de una DB que tuviera el trigger viejo)
-- ================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- ================================================================
-- TABLES
-- ================================================================

-- profiles: 1 a 1 con auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#B8A9E8',
  avatar_url TEXT
);

-- spaces: personal o compartido
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PEN',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- space_members
CREATE TABLE IF NOT EXISTS space_members (
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (space_id, user_id)
);

-- space_shares: un espacio combinado (space_id) muestra movimientos
-- de los espacios personales (shared_space_id) que sus miembros comparten.
CREATE TABLE IF NOT EXISTS space_shares (
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  shared_space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (space_id, shared_space_id),
  CHECK (shared_space_id <> space_id)
);

-- accounts: pertenecen al usuario, no al espacio.
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'digital_wallet', 'savings', 'other')),
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- categories: pertenecen al usuario, no al espacio.
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT
);

-- transactions: income, expense o transfer.
-- transfer usa account_id (origen) y to_account_id (destino), sin categoría.
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  user_id UUID REFERENCES profiles(id),
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  description TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- user_preferences: exclusiones de cuenta por usuario/espacio
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  excluded_balance_accounts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- account_shares: compartir cuentas de forma granular por espacio
CREATE TABLE IF NOT EXISTS account_shares (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, space_id)
);

-- ================================================================
-- INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_space_id ON transactions(space_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user ON space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_space ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_space ON space_shares(space_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_shared ON space_shares(shared_space_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_shares_one_per_user ON space_shares(created_by);

-- ================================================================
-- FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ================================================================

CREATE OR REPLACE FUNCTION is_space_member(_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members WHERE space_id = _space_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_space_owner(_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members WHERE space_id = _space_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- ¿Puede ver/editar datos de un espacio? Sí si es miembro directo
-- o si es miembro de un espacio combinado que lo comparte.
CREATE OR REPLACE FUNCTION can_access_space(_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_space_member(_space_id)
    OR EXISTS (
      SELECT 1 FROM space_shares ss
      WHERE ss.shared_space_id = _space_id AND is_space_member(ss.space_id)
    );
$$;

-- Crear espacio (llamado en primer login y al crear un espacio nuevo).
CREATE OR REPLACE FUNCTION create_space(p_name TEXT, p_currency TEXT DEFAULT 'PEN', p_code TEXT DEFAULT NULL)
RETURNS public.spaces
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_space public.spaces%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO spaces (name, invite_code, currency, created_by)
  VALUES (p_name, COALESCE(p_code, upper(substr(md5(random()::text), 1, 8))), p_currency, auth.uid())
  RETURNING * INTO v_space;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space.id, auth.uid(), 'owner');
  RETURN v_space;
END;
$$;
REVOKE ALL ON FUNCTION create_space(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_space(TEXT, TEXT, TEXT) TO authenticated;

-- Unirse a espacio por código de invitación.
CREATE OR REPLACE FUNCTION join_space(p_code TEXT)
RETURNS public.spaces
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_space public.spaces%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_space FROM spaces WHERE upper(invite_code) = upper(p_code) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space.id, auth.uid(), 'member')
  ON CONFLICT (space_id, user_id) DO NOTHING;
  RETURN v_space;
END;
$$;
REVOKE ALL ON FUNCTION join_space(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_space(TEXT) TO authenticated;

-- Generar código de invitación (utilidad).
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN upper(substr(md5(random()::text), 1, 8));
END;
$$;

-- ================================================================
-- ENABLE RLS
-- ================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_shares ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- ROW LEVEL SECURITY POLICIES (estado final)
-- ================================================================

-- profiles: leer todos (para espacios compartidos), escribir solo lo propio.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- spaces: visible si el usuario tiene acceso (miembro o compartido vía space_shares).
DROP POLICY IF EXISTS "spaces_select_member" ON spaces;
CREATE POLICY "spaces_select_member" ON spaces FOR SELECT USING (can_access_space(id));

DROP POLICY IF EXISTS "spaces_insert" ON spaces;
CREATE POLICY "spaces_insert" ON spaces FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "spaces_update_owner" ON spaces;
CREATE POLICY "spaces_update_owner" ON spaces FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS "spaces_delete_owner" ON spaces;
CREATE POLICY "spaces_delete_owner" ON spaces FOR DELETE USING (created_by = auth.uid());

-- space_members
DROP POLICY IF EXISTS "space_members_select" ON space_members;
CREATE POLICY "space_members_select" ON space_members FOR SELECT USING (is_space_member(space_id));

DROP POLICY IF EXISTS "space_members_insert_owner" ON space_members;
CREATE POLICY "space_members_insert_owner" ON space_members
  FOR INSERT WITH CHECK (
    is_space_member(space_id)
    OR EXISTS (SELECT 1 FROM spaces WHERE id = space_id AND created_by = auth.uid())
  );

-- El dueño puede borrar miembros (expulsar).
DROP POLICY IF EXISTS "space_members_delete_owner" ON space_members;
CREATE POLICY "space_members_delete_owner" ON space_members FOR DELETE USING (is_space_owner(space_id));

-- Cualquier miembro puede salirse (borrar su propia fila).
DROP POLICY IF EXISTS "space_members_leave" ON space_members;
CREATE POLICY "space_members_leave" ON space_members FOR DELETE USING (user_id = auth.uid());

-- space_shares: solo los miembros del espacio combinado lo administra.
DROP POLICY IF EXISTS "space_shares_select" ON space_shares;
CREATE POLICY "space_shares_select" ON space_shares FOR SELECT USING (is_space_member(space_id));

DROP POLICY IF EXISTS "space_shares_insert" ON space_shares;
CREATE POLICY "space_shares_insert" ON space_shares
  FOR INSERT WITH CHECK (
    is_space_member(space_id)
    AND created_by = auth.uid()
    AND is_space_owner(shared_space_id)
  );

DROP POLICY IF EXISTS "space_shares_delete" ON space_shares;
CREATE POLICY "space_shares_delete" ON space_shares
  FOR DELETE USING (is_space_member(space_id) AND created_by = auth.uid());

-- accounts: ver las propias + las que otros compartieron elegidas hacia mis espacios
-- + las que aparecen en transferencias visibles (para nombre del destino).
DROP POLICY IF EXISTS "accounts_select" ON accounts;
CREATE POLICY "accounts_select" ON accounts
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM account_shares ash
        WHERE ash.account_id = accounts.id
          AND ash.created_by = accounts.user_id
          AND is_space_member(ash.space_id)
      )
      OR EXISTS (
        SELECT 1 FROM transactions t
        WHERE (t.account_id = accounts.id OR t.to_account_id = accounts.id)
          AND can_access_space(t.space_id)
      )
    )
  );

DROP POLICY IF EXISTS "accounts_insert" ON accounts;
CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

DROP POLICY IF EXISTS "accounts_update" ON accounts;
CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE USING (user_id = auth.uid());

-- categories: ver las propias + las de quienes compartieron un espacio hacia el mío.
DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid()
      OR user_id IN (
        SELECT ss.created_by FROM space_shares ss WHERE is_space_member(ss.space_id)
      )
    )
  );

DROP POLICY IF EXISTS "categories_insert" ON categories;
CREATE POLICY "categories_insert" ON categories
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

DROP POLICY IF EXISTS "categories_update" ON categories;
CREATE POLICY "categories_update" ON categories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_delete" ON categories
  FOR DELETE USING (user_id = auth.uid());

-- transactions
DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (can_access_space(space_id));

DROP POLICY IF EXISTS "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (is_space_member(space_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (is_space_member(space_id));

DROP POLICY IF EXISTS "transactions_delete" ON transactions;
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (is_space_member(space_id));

-- user_preferences
DROP POLICY IF EXISTS "user_preferences_select" ON user_preferences;
CREATE POLICY "user_preferences_select" ON user_preferences FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences_insert" ON user_preferences;
CREATE POLICY "user_preferences_insert" ON user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences_update" ON user_preferences;
CREATE POLICY "user_preferences_update" ON user_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- account_shares
DROP POLICY IF EXISTS "account_shares_select" ON account_shares;
CREATE POLICY "account_shares_select" ON account_shares
  FOR SELECT USING (created_by = auth.uid() OR is_space_member(space_id));

DROP POLICY IF EXISTS "account_shares_insert" ON account_shares;
CREATE POLICY "account_shares_insert" ON account_shares
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND account_id IN (SELECT a.id FROM accounts a WHERE a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "account_shares_delete" ON account_shares;
CREATE POLICY "account_shares_delete" ON account_shares
  FOR DELETE USING (created_by = auth.uid());

-- ================================================================
-- STORAGE
-- ================================================================

-- avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_authenticated_write" ON storage.objects;
CREATE POLICY "avatars_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
CREATE POLICY "avatars_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;
CREATE POLICY "avatars_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- transaction-photos
INSERT INTO storage.buckets (id, name, public) VALUES ('transaction-photos', 'transaction-photos', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "transaction_photos_public_read" ON storage.objects;
CREATE POLICY "transaction_photos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'transaction-photos');

DROP POLICY IF EXISTS "transaction_photos_authenticated_write" ON storage.objects;
CREATE POLICY "transaction_photos_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'transaction-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "transaction_photos_authenticated_update" ON storage.objects;
CREATE POLICY "transaction_photos_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'transaction-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "transaction_photos_authenticated_delete" ON storage.objects;
CREATE POLICY "transaction_photos_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'transaction-photos' AND auth.role() = 'authenticated');

-- icons
INSERT INTO storage.buckets (id, name, public) VALUES ('icons', 'icons', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "icons_public_read" ON storage.objects;
CREATE POLICY "icons_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'icons');

DROP POLICY IF EXISTS "icons_authenticated_write" ON storage.objects;
CREATE POLICY "icons_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'icons' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "icons_authenticated_update" ON storage.objects;
CREATE POLICY "icons_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'icons' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "icons_authenticated_delete" ON storage.objects;
CREATE POLICY "icons_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'icons' AND auth.role() = 'authenticated');

-- apk (bucket público para distribuir el APK)
INSERT INTO storage.buckets (id, name, public) VALUES ('apk', 'apk', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "apk_public_read" ON storage.objects;
CREATE POLICY "apk_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'apk');

DROP POLICY IF EXISTS "apk_authenticated_write" ON storage.objects;
CREATE POLICY "apk_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'apk' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "apk_authenticated_update" ON storage.objects;
CREATE POLICY "apk_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'apk' AND auth.role() = 'authenticated');

-- ================================================================
-- GRANTS (para que auth.anonymous no rompa RLS en tablas nuevas)
-- ================================================================

GRANT SELECT, INSERT, UPDATE ON user_preferences TO authenticated;
GRANT SELECT, INSERT, DELETE ON account_shares TO authenticated;

-- ================================================================
-- RELOAD SCACHE (para que PostgREST vea las tablas/RLS nuevas)
-- ================================================================

NOTIFY pgrst, 'reload schema';