;;; Controlled post-INIT-RANDOM reseed holdout for a second seed.
(in-package :cl-user)
(set 'aaron-planning-seed 5678)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-reseed-after-init t)
(load "C:\\temp\\planning-random-seed-common.cl")
