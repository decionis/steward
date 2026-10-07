import type { PreviewProduct } from "@/domain/PreviewCatalog";

export function ProductArt({ kind }: { kind: PreviewProduct["artwork"] }) {
  return (
    <svg viewBox="0 0 360 240" aria-hidden="true" focusable="false">
      {kind === "bowl" && (
        <>
          <rect width="360" height="240" fill="#e8eddc" />
          <ellipse cx="190" cy="201" rx="110" ry="13" fill="#ced9bf" />
          <path
            d="M81 120H286L265 179Q254 205 185 204Q113 201 101 177Z"
            fill="#fbf9f1"
          />
          <ellipse cx="183" cy="121" rx="105" ry="52" fill="#fffdf5" />
          <ellipse cx="183" cy="122" rx="91" ry="41" fill="#c4bb85" />
          <g fill="#56825b">
            <ellipse
              cx="126"
              cy="111"
              rx="23"
              ry="13"
              transform="rotate(-30 126 111)"
            />
            <ellipse
              cx="150"
              cy="92"
              rx="26"
              ry="12"
              transform="rotate(15 150 92)"
            />
            <ellipse
              cx="115"
              cy="134"
              rx="24"
              ry="12"
              transform="rotate(18 115 134)"
            />
          </g>
          <g fill="#dc8850">
            <rect
              x="167"
              y="102"
              width="29"
              height="22"
              rx="5"
              transform="rotate(17 167 102)"
            />
            <rect
              x="169"
              y="133"
              width="27"
              height="21"
              rx="5"
              transform="rotate(-16 169 133)"
            />
            <rect x="199" y="97" width="23" height="21" rx="4" />
          </g>
          <g fill="#8c9c65">
            <ellipse
              cx="238"
              cy="121"
              rx="15"
              ry="19"
              transform="rotate(40 238 121)"
            />
            <ellipse cx="218" cy="144" rx="20" ry="11" />
          </g>
          <circle cx="230" cy="89" r="19" fill="#f7d980" />
          <circle cx="230" cy="89" r="14" fill="#fff2bd" />
          <path
            d="M308 62L281 173"
            stroke="#8f6948"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M320 67L291 176"
            stroke="#8f6948"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      )}
      {(kind === "coffee" || kind === "tea") && (
        <>
          <rect
            width="360"
            height="240"
            fill={kind === "coffee" ? "#ebddc8" : "#e3e9dd"}
          />
          <ellipse
            cx="183"
            cy="191"
            rx="100"
            ry="17"
            fill={kind === "coffee" ? "#d9c4a6" : "#c5d2ba"}
          />
          <ellipse cx="177" cy="179" rx="92" ry="21" fill="#faf8ef" />
          <path
            d="M120 88H235L226 156Q220 179 177 179Q134 179 128 158Z"
            fill={kind === "coffee" ? "#a37352" : "#769580"}
          />
          <path
            d="M233 107Q278 96 269 132Q263 154 230 145"
            fill="none"
            stroke={kind === "coffee" ? "#a37352" : "#769580"}
            strokeWidth="12"
          />
          <ellipse cx="177" cy="90" rx="59" ry="22" fill="#faf8ef" />
          <ellipse
            cx="177"
            cy="90"
            rx="49"
            ry="15"
            fill={kind === "coffee" ? "#b98b58" : "#d4af56"}
          />
          {kind === "coffee" ? (
            <>
              <path
                d="M176 99Q145 86 160 82Q175 76 177 88Q181 72 195 81Q209 89 176 99"
                fill="#f5e6c9"
              />
              <path d="M177 99L179 80" stroke="#fff2d8" strokeWidth="2" />
            </>
          ) : (
            <>
              <ellipse
                cx="167"
                cy="90"
                rx="14"
                ry="5"
                fill="#b19b4c"
                transform="rotate(-20 167 90)"
              />
              <ellipse cx="189" cy="89" rx="11" ry="4" fill="#e8d79a" />
            </>
          )}
          <path
            d="M164 61Q150 49 165 35M190 63Q176 46 190 28"
            stroke="#fff9ed"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M63 185Q78 139 62 125M62 160Q36 147 43 140Q62 136 62 160M67 173Q88 150 94 159Q91 178 67 173"
            fill="#78906d"
            stroke="#78906d"
            strokeWidth="3"
          />
        </>
      )}
      {kind === "notebook" && (
        <>
          <rect width="360" height="240" fill="#eadfdc" />
          <ellipse cx="185" cy="209" rx="99" ry="10" fill="#d8c9c4" />
          <g transform="rotate(-12 180 120)">
            <rect
              x="114"
              y="43"
              width="142"
              height="164"
              rx="7"
              fill="#b28b76"
            />
            <rect
              x="110"
              y="39"
              width="142"
              height="161"
              rx="7"
              fill="#754d40"
            />
            <path d="M124 40V198" stroke="#a57864" strokeWidth="3" />
            <rect x="145" y="71" width="82" height="39" rx="1" fill="#ead8bd" />
            <path d="M160 87H211M173 95H199" stroke="#99795d" strokeWidth="2" />
            <path d="M231 40V199" stroke="#d1ab79" strokeWidth="4" />
          </g>
          <path
            d="M281 70L251 198"
            stroke="#d3ad67"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path d="M252 195L248 211L258 198" fill="#5d493f" />
        </>
      )}
      {kind === "plant" && (
        <>
          <rect width="360" height="240" fill="#eee7d7" />
          <ellipse cx="184" cy="211" rx="72" ry="10" fill="#dcd1bb" />
          <path
            d="M135 139H232L222 198Q220 211 184 211Q146 211 143 198Z"
            fill="#c78d69"
          />
          <ellipse cx="183" cy="138" rx="49" ry="13" fill="#dfa17c" />
          <ellipse cx="184" cy="138" rx="39" ry="8" fill="#785e48" />
          <path
            d="M183 139Q192 85 177 46M186 104L140 74M187 90L225 60"
            stroke="#4c7453"
            strokeWidth="5"
            fill="none"
          />
          <g fill="#5a8458">
            <ellipse
              cx="162"
              cy="56"
              rx="28"
              ry="12"
              transform="rotate(27 162 56)"
            />
            <ellipse
              cx="143"
              cy="86"
              rx="32"
              ry="14"
              transform="rotate(32 143 86)"
            />
            <ellipse
              cx="221"
              cy="79"
              rx="34"
              ry="16"
              transform="rotate(-36 221 79)"
            />
          </g>
          <g fill="#77925d">
            <ellipse
              cx="183"
              cy="38"
              rx="15"
              ry="24"
              transform="rotate(-25 183 38)"
            />
            <ellipse
              cx="215"
              cy="119"
              rx="33"
              ry="13"
              transform="rotate(-20 215 119)"
            />
          </g>
        </>
      )}
      {kind === "workshop" && (
        <>
          <rect width="360" height="240" fill="#e3e0ed" />
          <path d="M46 164L266 126L324 176L96 218Z" fill="#cbbda8" />
          <path
            d="M46 164V177L96 231V218M96 218L324 176V190L96 231"
            fill="#a48d75"
          />
          <path d="M99 130L189 111L221 146L132 166Z" fill="#fcf6e9" />
          <path
            d="M115 135L181 121M125 144L191 131M135 151L186 142"
            stroke="#b4a7cb"
            strokeWidth="3"
          />
          <rect x="225" y="98" width="45" height="50" rx="8" fill="#8d759f" />
          <ellipse cx="247" cy="98" rx="22" ry="9" fill="#b8a6c8" />
          <path
            d="M238 98L227 57M247 98L251 49M258 98L278 64"
            stroke="#6b7658"
            strokeWidth="5"
          />
          <circle cx="87" cy="98" r="25" fill="#b78361" />
          <path d="M64 97Q87 82 110 97" stroke="#e6c7a9" strokeWidth="4" />
        </>
      )}
    </svg>
  );
}
