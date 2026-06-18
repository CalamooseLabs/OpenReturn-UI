// Compat re-export barrel — the UI kit is now layered atoms + molecules.
// New code should import directly from "../components/atoms.tsx" /
// "../components/molecules.tsx". Kept so existing routes don't break.
export {
  Badge,
  Button,
  Divider,
  Eyebrow,
  LinkButton,
  Pill,
  type SelectOption,
} from "./atoms.tsx";
export {
  Alert,
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  FilterChip,
  Flash,
  InfoAlert,
  KpiCard,
  MetaRow,
  OrgIdentity,
  PageHeader,
  Pagination,
  Panel,
  PillarRing,
  ScoreBar,
  ScoreCell,
  Section,
  Select,
  Stat,
  Table,
} from "./molecules.tsx";
