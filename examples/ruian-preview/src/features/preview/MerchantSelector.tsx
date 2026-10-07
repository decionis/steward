import { MERCHANTS, type MerchantId } from "@/domain/PreviewCatalog";
import styles from "./Preview.module.css";

export function MerchantSelector({
  id,
  value,
  onChange,
}: {
  id: string;
  value: MerchantId;
  onChange(value: MerchantId): void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Sample merchant</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as MerchantId)}
      >
        {MERCHANTS.map((merchant) => (
          <option key={merchant.id} value={merchant.id}>
            {merchant.name}
          </option>
        ))}
      </select>
    </div>
  );
}
