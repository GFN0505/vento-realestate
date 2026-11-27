import type { ApprovalRequestDetail } from '@vento/shared'
import { TimelineItem, type TimelineMark } from '@/components/timeline-item'
import { ageText, spokenAge, stepWords } from './approval-words'

const MARKS = {
  approved: 'done',
  rejected: 'rejected',
  waiting: 'now',
  upcoming: 'later',
  not_reached: 'later',
} as const satisfies Record<ApprovalRequestDetail['steps'][number]['state'], TimelineMark>

type Props = Pick<ApprovalRequestDetail, 'makerName' | 'createdAt' | 'steps'>

/**
 * The steps as a TimelineItem chain (spec): who asked, then each step in order with who decided
 * and when. A list, so screen readers hear "Finance review, approved by Aisha Bello, …".
 */
export function StepsChain({ makerName, createdAt, steps }: Props) {
  return (
    <ol aria-label="Steps" className="flex flex-col">
      <TimelineItem
        mark="done"
        title={`Requested by ${makerName}`}
        meta={ageText(createdAt)}
        spoken={`Requested by ${makerName}, ${spokenAge(createdAt)}`}
        last={steps.length === 0}
      />
      {steps.map((step, index) => {
        const words = stepWords(step)
        const comment = step.decision?.comment ? `“${step.decision.comment}”` : undefined
        return (
          <TimelineItem
            key={step.position}
            mark={MARKS[step.state]}
            title={words.title}
            meta={words.meta}
            spoken={comment ? `${words.spoken}: ${comment}` : words.spoken}
            detail={comment}
            last={index === steps.length - 1}
          />
        )
      })}
    </ol>
  )
}
