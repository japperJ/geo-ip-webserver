import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { siteApi } from '@/lib/api';
import type { CreateSiteInput, UpdateSiteInput } from '@/lib/api';
import { validateIPList, ipArrayToText, ipTextToArray } from '@/lib/ipValidation';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { GeofenceMap } from '@/components/GeofenceMap';

interface FormData {
  slug: string;
  name: string;
  hostname: string;
  access_mode: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist_text: string;
  ip_denylist_text: string;
  country_allowlist_text: string;
  country_denylist_text: string;
  vpn_detection_enabled: boolean;
  is_active: boolean;
  geofence_type?: 'polygon' | 'radius' | null;
  geofence_polygon?: GeoJSON.Polygon | null;
  geofence_center?: GeoJSON.Point | null;
  geofence_radius_km?: number | null;
}

export function SiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditMode = Boolean(id);

  const [ipAllowlistErrors, setIpAllowlistErrors] = useState<Array<{ line: number; value: string; error: string }>>([]);
  const [ipDenylistErrors, setIpDenylistErrors] = useState<Array<{ line: number; value: string; error: string }>>([]);
  const [geofence, setGeofence] = useState<{
    type: 'polygon' | 'radius';
    polygon?: GeoJSON.Polygon;
    center?: GeoJSON.Point;
    radius_km?: number;
  } | null>(null);

  const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      slug: '',
      name: '',
      hostname: '',
      access_mode: 'disabled',
      ip_allowlist_text: '',
      ip_denylist_text: '',
      country_allowlist_text: '',
      country_denylist_text: '',
      vpn_detection_enabled: false,
      is_active: true,
      geofence_type: null,
      geofence_polygon: null,
      geofence_center: null,
      geofence_radius_km: null,
    },
  });

  // Load site data in edit mode
  const { data: site, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: () => siteApi.getById(id!),
    enabled: isEditMode,
  });

  // Populate form when site data loads
  useEffect(() => {
    if (site) {
      setValue('slug', site.slug);
      setValue('name', site.name);
      setValue('hostname', site.hostname ?? '');
      setValue('access_mode', site.access_mode);
      setValue('ip_allowlist_text', ipArrayToText(site.ip_allowlist));
      setValue('ip_denylist_text', ipArrayToText(site.ip_denylist));
      setValue('country_allowlist_text', (site.country_allowlist ?? []).join('\n'));
      setValue('country_denylist_text', (site.country_denylist ?? []).join('\n'));
      setValue('vpn_detection_enabled', site.block_vpn_proxy ?? false);
      setValue('is_active', site.enabled ?? true);
      
      // Set geofence data
      if (site.geofence_type) {
        setGeofence({
          type: site.geofence_type,
          polygon: site.geofence_polygon,
          center: site.geofence_center,
          radius_km: site.geofence_radius_km,
        });
      }
    }
  }, [site, setValue]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateSiteInput) => siteApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      navigate('/sites');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateSiteInput) => siteApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      navigate('/sites');
    },
  });

  // Watch IP list fields for real-time validation
  const ipAllowlistText = watch('ip_allowlist_text');
  const ipDenylistText = watch('ip_denylist_text');

  useEffect(() => {
    const validation = validateIPList(ipAllowlistText);
    setIpAllowlistErrors(validation.invalid);
  }, [ipAllowlistText]);

  useEffect(() => {
    const validation = validateIPList(ipDenylistText);
    setIpDenylistErrors(validation.invalid);
  }, [ipDenylistText]);

  const onSubmit = async (data: FormData) => {
    // Validate IP lists
    const allowlistValidation = validateIPList(data.ip_allowlist_text);
    const denylistValidation = validateIPList(data.ip_denylist_text);

    if (allowlistValidation.invalid.length > 0 || denylistValidation.invalid.length > 0) {
      alert('Please fix IP validation errors before saving');
      return;
    }

    const payload = {
      slug: data.slug,
      name: data.name,
      hostname: data.hostname,
      access_mode: data.access_mode,
      ip_allowlist: ipTextToArray(data.ip_allowlist_text),
      ip_denylist: ipTextToArray(data.ip_denylist_text),
      country_allowlist: data.country_allowlist_text
        .split('\n')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s !== ''),
      country_denylist: data.country_denylist_text
        .split('\n')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s !== ''),
      block_vpn_proxy: data.vpn_detection_enabled,
      enabled: data.is_active,
      geofence_type: geofence?.type || null,
      geofence_polygon: geofence?.polygon || null,
      geofence_center: geofence?.center || null,
      geofence_radius_km: geofence?.radius_km || null,
    };

    try {
      if (isEditMode) {
        const { slug, ...updatePayload } = payload;
        await updateMutation.mutateAsync(updatePayload as UpdateSiteInput);
      } else {
        await createMutation.mutateAsync(payload as CreateSiteInput);
      }
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Failed to save site. Please check your inputs and try again.';
      alert(apiMessage);
    }
  };

  if (isEditMode && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/sites')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sites
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-white">
          {isEditMode ? 'Edit Site' : 'Create Site'}
        </h1>
        <p className="mt-2 text-gray-400">
          {isEditMode ? 'Update site configuration and access rules.' : 'Create a new geo-fenced site.'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Site identification and basic settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  {...register('slug', {
                    required: 'Slug is required',
                    minLength: {
                      value: 3,
                      message: 'Slug must be at least 3 characters',
                    },
                    pattern: {
                      value: /^[a-z0-9-]+$/,
                      message: 'Slug must use lowercase letters, numbers, and hyphens only',
                    },
                  })}
                  disabled={isEditMode}
                  placeholder="my-site"
                />
                {errors.slug && (
                  <p className="text-sm text-red-500">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Name is required' })}
                  placeholder="My Site"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostname">Hostname *</Label>
              <Input
                id="hostname"
                {...register('hostname', { required: 'Hostname is required' })}
                placeholder="example.com"
              />
              {errors.hostname && (
                <p className="text-sm text-red-500">{errors.hostname.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="access_mode">Access Mode *</Label>
                <Controller
                  name="access_mode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Disabled (No restrictions)</SelectItem>
                        <SelectItem value="ip_only">IP Only</SelectItem>
                        <SelectItem value="geo_only">GPS Only</SelectItem>
                        <SelectItem value="ip_and_geo">IP + GPS</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex items-center space-x-4 pt-8">
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor="is_active">Site Active</Label>
                    </div>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* IP Access Control */}
        <Card>
          <CardHeader>
            <CardTitle>IP Access Control</CardTitle>
            <CardDescription>
              Configure IP allowlist and denylist. One IP address or CIDR range per line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip_allowlist">IP Allowlist</Label>
              <Textarea
                id="ip_allowlist"
                {...register('ip_allowlist_text')}
                placeholder="192.168.1.0/24&#10;10.0.0.1&#10;2001:db8::/32"
                rows={5}
                className={ipAllowlistErrors.length > 0 ? 'border-red-500' : ''}
              />
              {ipAllowlistErrors.length > 0 && (
                <div className="rounded-md bg-red-900/20 border border-red-500 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-red-500 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    <span>Invalid IP addresses:</span>
                  </div>
                  {ipAllowlistErrors.map((err, idx) => (
                    <p key={idx} className="text-sm text-red-400 pl-6">
                      Line {err.line}: {err.value} - {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ip_denylist">IP Denylist</Label>
              <Textarea
                id="ip_denylist"
                {...register('ip_denylist_text')}
                placeholder="192.168.2.0/24&#10;10.0.1.1"
                rows={5}
                className={ipDenylistErrors.length > 0 ? 'border-red-500' : ''}
              />
              {ipDenylistErrors.length > 0 && (
                <div className="rounded-md bg-red-900/20 border border-red-500 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-red-500 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    <span>Invalid IP addresses:</span>
                  </div>
                  {ipDenylistErrors.map((err, idx) => (
                    <p key={idx} className="text-sm text-red-400 pl-6">
                      Line {err.line}: {err.value} - {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Country Lists */}
        <Card>
          <CardHeader>
            <CardTitle>Country-Based Access Control</CardTitle>
            <CardDescription>
              Configure country allowlist and denylist using ISO 3166-1 alpha-2 codes (e.g., US, GB, CA). One code per line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country_allowlist">Country Allowlist</Label>
                <Textarea
                  id="country_allowlist"
                  {...register('country_allowlist_text')}
                  placeholder="US&#10;CA&#10;GB"
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country_denylist">Country Denylist</Label>
                <Textarea
                  id="country_denylist"
                  {...register('country_denylist_text')}
                  placeholder="CN&#10;RU&#10;KP"
                  rows={5}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VPN Detection */}
        <Card>
          <CardHeader>
            <CardTitle>VPN Detection</CardTitle>
            <CardDescription>
              Enable VPN detection to block requests from VPN providers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="vpn_detection_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="vpn_detection"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="vpn_detection">Enable VPN Detection</Label>
                </div>
              )}
            />
          </CardContent>
        </Card>

        {/* GPS Geofencing */}
        {(watch('access_mode') === 'geo_only' || watch('access_mode') === 'ip_and_geo') && (
          <Card>
            <CardHeader>
              <CardTitle>GPS Geofencing</CardTitle>
              <CardDescription>
                Draw a polygon or circle on the map to define the allowed area.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeofenceMap
                geofence={geofence}
                onGeofenceChange={setGeofence}
              />
              {geofence && (
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500 rounded-md">
                  <p className="text-sm text-blue-400">
                    <strong>Type:</strong> {geofence.type === 'polygon' ? 'Polygon' : 'Radius'}{' '}
                    {geofence.radius_km && `(${geofence.radius_km.toFixed(2)} km)`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEditMode ? 'Update Site' : 'Create Site'}
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/sites')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
