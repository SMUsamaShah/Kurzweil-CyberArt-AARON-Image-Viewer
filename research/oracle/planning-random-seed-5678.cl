;;; Seed-only planning holdout with a different seed.
(in-package :cl-user)
(set 'aaron-planning-seed 5678)
(set 'aaron-planning-set-rseed nil)
(load "C:\\temp\\planning-random-seed-common.cl")
