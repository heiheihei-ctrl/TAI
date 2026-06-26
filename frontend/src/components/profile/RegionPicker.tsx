import React from "react";
import {
  formatRegion,
  getCitiesForProvince,
  getDistrictsForCity,
  getProvinces,
  parseRegion,
} from "@/data/chinaRegions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const selectClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export default function RegionPicker({ value, onChange, className }: Props) {
  const parsed = React.useMemo(() => parseRegion(value), [value]);
  const [province, setProvince] = React.useState(parsed.province);
  const [city, setCity] = React.useState(parsed.city);
  const [district, setDistrict] = React.useState(parsed.district);

  React.useEffect(() => {
    setProvince(parsed.province);
    setCity(parsed.city);
    setDistrict(parsed.district);
  }, [parsed.province, parsed.city, parsed.district]);

  const provinces = React.useMemo(() => getProvinces(), []);
  const cities = React.useMemo(
    () => (province ? getCitiesForProvince(province) : []),
    [province],
  );
  const districts = React.useMemo(
    () => (province && city ? getDistrictsForCity(province, city) : []),
    [province, city],
  );

  const emitChange = (nextProvince: string, nextCity: string, nextDistrict: string) => {
    if (nextProvince && nextCity && nextDistrict) {
      onChange(formatRegion(nextProvince, nextCity, nextDistrict));
      return;
    }
    onChange("");
  };

  const handleProvinceChange = (nextProvince: string) => {
    setProvince(nextProvince);
    const nextCities = getCitiesForProvince(nextProvince);
    const nextCity = nextCities[0] || "";
    setCity(nextCity);
    const nextDistricts = nextProvince && nextCity ? getDistrictsForCity(nextProvince, nextCity) : [];
    const nextDistrict = nextDistricts[0] || "";
    setDistrict(nextDistrict);
    emitChange(nextProvince, nextCity, nextDistrict);
  };

  const handleCityChange = (nextCity: string) => {
    setCity(nextCity);
    const nextDistricts = province && nextCity ? getDistrictsForCity(province, nextCity) : [];
    const nextDistrict = nextDistricts[0] || "";
    setDistrict(nextDistrict);
    emitChange(province, nextCity, nextDistrict);
  };

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    emitChange(province, city, nextDistrict);
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          className={selectClassName}
          value={province}
          onChange={(event) => handleProvinceChange(event.target.value)}
        >
          <option value="">请选择省份</option>
          {provinces.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
          value={city}
          disabled={!province}
          onChange={(event) => handleCityChange(event.target.value)}
        >
          <option value="">请选择城市</option>
          {cities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
          value={district}
          disabled={!province || !city}
          onChange={(event) => handleDistrictChange(event.target.value)}
        >
          <option value="">请选择区县</option>
          {districts.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
