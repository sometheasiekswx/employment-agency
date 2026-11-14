# Desktop role details review

Reviewed the scoped change against baseline `584e012`, including the inspector structure and layout, removal controller, focus/hover handling, tests and matched browser evidence. No remaining blocking findings were identified.

The first implementation assumed the sticky pane started at the viewport gutter. Review caught that the shell header could put the footer below the initial viewport. The final implementation measures the shell offset, and the browser regression verifies the initial unscrolled geometry, a changing shell notice, short windows and the wider CV view.

The countdown starts after a confirmed success, retains the remaining time when paused and cannot dismiss a newer feedback object. Pending restoration has its own visible state; failures retain Retry. Dismissal changes only feedback, and reason drafts and removal records remain available. Interaction listeners release their hold on unmount. The compact visible To apply control retains an explicit accessible action name.

The removed unit test asserted the old CSS variable rather than rendered behavior. Its viewport and preceding-content resize contract is covered in the new browser regression. Existing recovery, draft, focus, motion and mobile sheet assertions were retained. The application journey assertion now checks the accessible action, selected state and compact visible label.

[Verification evidence](evidence.md) records passing local checks and limitations. Screenshots and geometry were inspected at standard and short desktop sizes, including enlarged text. No backend, dependency, schema, private-data or submission behavior changed. Physical Safari/VoiceOver and the full CI matrix remain separate from the local browser-engine evidence.

Delivery uses a feature branch based on published main. Reverting the feature commit restores the previous UI. No private installed workspace upgrade or public production deployment is part of this change.
