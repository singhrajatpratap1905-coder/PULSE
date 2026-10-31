import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import type { Activity } from '@shared/widget'
import { usePulse } from './store'
import { api } from './api'
import { widgetById } from './widgets/registry'
import { SceneArt, showsScene } from './mascot/Scene'

const DEFAULT_DURATION_MS = 2400
// Scenes are little animations; give them time to play.
const SCENE_DURATION_MS = 5000

/** What the collapsed notch shows for one activity; advances the queue when its time is up. */
export function ActivityView({ activity }: { activity: Activity }): JSX.Element {
  const nextActivity = usePulse((s) => s.nextActivity)
  const scene = usePulse((s) => showsScene(activity, s.mascot))

  useEffect(() => {
    if (activity.scene) api.log(`showing "${activity.title}" ${scene ? 'with Boo' : 'as plain text'}`)
  }, [activity.id, activity.scene, activity.title, scene])

  const duration = activity.durationMs ?? (scene ? SCENE_DURATION_MS : DEFAULT_DURATION_MS)
  useEffect(() => {
    const timer = setTimeout(nextActivity, duration)
    return () => clearTimeout(timer)
  }, [activity.id, duration, nextActivity])

  const Icon = widgetById(activity.widgetId)?.icon ?? Bell

  return (
    <motion.div
      className={`activity${scene ? ' activity-scene' : ''}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.08, duration: 0.16 } }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
    >
      {scene && activity.scene ? (
        <>
          <SceneArt scene={activity.scene} />
          <span className="scene-text">
            <span className="scene-title">{activity.title}</span>
            {activity.detail && <span className="activity-detail">{activity.detail}</span>}
          </span>
        </>
      ) : (
        <>
          <Icon size={15} className={`activity-icon tone-${activity.tone ?? 'neutral'}`} />
          <span className="activity-title">{activity.title}</span>
          {activity.detail && <span className="activity-detail">· {activity.detail}</span>}
        </>
      )}
    </motion.div>
  )
}
