import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillInvocation } from "../types";
import styles from "./SkillHistory.module.css";

interface Props {
  jsonlPath: string;
}

export function SkillHistory({ jsonlPath }: Props) {
  const [history, setHistory] = useState<SkillInvocation[]>([]);

  useEffect(() => {
    invoke<SkillInvocation[]>("get_skill_history", { jsonlPath })
      .then(setHistory)
      .catch(() => {});
  }, [jsonlPath]);

  if (history.length === 0) return null;

  return (
    <div className={styles.root}>
      <div className={styles.title}>Skill History</div>
      <div className={styles.list}>
        {history.map((item, i) => {
          const time = item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          return (
            <div key={i} className={styles.item}>
              <span className={styles.name}>/{item.skill}</span>
              {item.args && <span className={styles.args}>{item.args}</span>}
              {time && <span className={styles.time}>{time}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
