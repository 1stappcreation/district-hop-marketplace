
CREATE TYPE public.account_type AS ENUM ('passenger','driver');
CREATE TYPE public.vehicle_type AS ENUM ('motorcycle','rickshaw','car','minivan','delivery');
CREATE TYPE public.ride_status AS ENUM ('searching','accepted','arrived','in_progress','completed','cancelled');
CREATE TYPE public.offer_status AS ENUM ('pending','accepted','rejected');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  account_type public.account_type,
  vehicle_type public.vehicle_type,
  vehicle_plate text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, phone) VALUES (NEW.id, NEW.phone) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_driver(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND account_type = 'driver')
$$;

CREATE TABLE public.driver_status (
  driver_id uuid PRIMARY KEY,
  is_online boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_status TO authenticated;
GRANT ALL ON public.driver_status TO service_role;
ALTER TABLE public.driver_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver status readable" ON public.driver_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "driver writes own status" ON public.driver_status FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid() AND public.is_driver(auth.uid()));
CREATE POLICY "driver updates own status" ON public.driver_status FOR UPDATE TO authenticated USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

CREATE TABLE public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL,
  driver_id uuid,
  vehicle_type public.vehicle_type NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  pickup_address text,
  drop_lat double precision NOT NULL,
  drop_lng double precision NOT NULL,
  drop_address text,
  distance_km numeric(6,2),
  offered_fare integer NOT NULL CHECK (offered_fare > 0),
  final_fare integer,
  payment_method text NOT NULL DEFAULT 'cash',
  parcel_note text,
  status public.ride_status NOT NULL DEFAULT 'searching',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passenger sees own rides" ON public.rides FOR SELECT TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "driver sees open and assigned rides" ON public.rides FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR (status = 'searching' AND public.is_driver(auth.uid())));
CREATE POLICY "passenger creates ride" ON public.rides FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid() AND status = 'searching' AND driver_id IS NULL);
CREATE POLICY "passenger cancels own ride" ON public.rides FOR UPDATE TO authenticated USING (passenger_id = auth.uid()) WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "driver updates assigned ride" ON public.rides FOR UPDATE TO authenticated USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

-- Rahim Yar Khan district geofence (approximate bounding box)
CREATE OR REPLACE FUNCTION public.enforce_district() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pickup_lat NOT BETWEEN 27.65 AND 29.30 OR NEW.pickup_lng NOT BETWEEN 69.45 AND 71.05
     OR NEW.drop_lat NOT BETWEEN 27.65 AND 29.30 OR NEW.drop_lng NOT BETWEEN 69.45 AND 71.05 THEN
    RAISE EXCEPTION 'Rides are only available inside Rahim Yar Khan district';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER rides_district BEFORE INSERT OR UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.enforce_district();

CREATE TABLE public.ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status public.offer_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, driver_id)
);
GRANT SELECT, INSERT, UPDATE ON public.ride_offers TO authenticated;
GRANT ALL ON public.ride_offers TO service_role;
ALTER TABLE public.ride_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver sees own offers" ON public.ride_offers FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "passenger sees offers on own ride" ON public.ride_offers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.passenger_id = auth.uid()));
CREATE POLICY "driver makes offer" ON public.ride_offers FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid() AND public.is_driver(auth.uid()) AND status = 'pending');
CREATE POLICY "driver edits own pending offer" ON public.ride_offers FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() AND status = 'pending') WITH CHECK (driver_id = auth.uid() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.accept_offer(_offer_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ride_offers; r public.rides;
BEGIN
  SELECT * INTO o FROM public.ride_offers WHERE id = _offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  SELECT * INTO r FROM public.rides WHERE id = o.ride_id FOR UPDATE;
  IF r.passenger_id <> auth.uid() THEN RAISE EXCEPTION 'Not your ride'; END IF;
  IF r.status <> 'searching' THEN RAISE EXCEPTION 'Ride already assigned'; END IF;
  UPDATE public.rides SET driver_id = o.driver_id, final_fare = o.amount, status = 'accepted' WHERE id = r.id;
  UPDATE public.ride_offers SET status = CASE WHEN id = o.id THEN 'accepted'::offer_status ELSE 'rejected'::offer_status END WHERE ride_id = r.id;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_offer(uuid) TO authenticated;

ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.ride_offers REPLICA IDENTITY FULL;
ALTER TABLE public.driver_status REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_status;
